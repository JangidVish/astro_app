#!/usr/bin/env node
// Starts Firebase emulators, runs a command against them, then stops the emulators.
//
// Replaces `firebase emulators:exec`, which on Windows leaves the Java emulator process
// running after exit (port stays taken, next run fails). Here we own the process tree and
// kill all of it: `taskkill /T` on Windows, the process group on POSIX.
//
// Usage:
//   node ../../scripts/with-emulators.mjs --only firestore -- vitest run
//   node ../../scripts/with-emulators.mjs --config ../../infra/firebase/firebase.json --only auth -- vitest run
import { spawn, spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const PROJECT_ID = 'demo-astro-app';
// The first start after a fresh `npm install` can be slow (firebase-tools is large and new files
// may be scanned by antivirus), so allow up to 5 minutes and report progress while waiting.
const READY_TIMEOUT_MS = 300_000;
const HEARTBEAT_MS = 30_000;
const isWindows = process.platform === 'win32';

const sep = process.argv.indexOf('--');
if (sep === -1 || sep === process.argv.length - 1) {
  console.error('Usage: with-emulators.mjs --only <emulators> -- <command...>');
  process.exit(2);
}
const emulatorArgs = process.argv.slice(2, sep);
const command = process.argv.slice(sep + 1);

const onlyIndex = emulatorArgs.indexOf('--only');
const only = onlyIndex === -1 ? null : emulatorArgs[onlyIndex + 1];
if (!only) {
  console.error('Pass --only <emulators>, e.g. --only firestore or --only auth,firestore');
  process.exit(2);
}

const configIndex = emulatorArgs.indexOf('--config');
const configPath = resolve(
  configIndex === -1 ? 'firebase.json' : (emulatorArgs[configIndex + 1] ?? ''),
);
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const ports = only.split(',').map((name) => {
  const entry = config.emulators?.[name];
  if (!entry?.port) throw new Error(`firebase.json has no emulators.${name}.port`);
  // An emulator bound to all interfaces (0.0.0.0) is still reached locally via loopback.
  const host = !entry.host || entry.host === '0.0.0.0' ? '127.0.0.1' : entry.host;
  return { name, host, port: entry.port };
});

function isListening({ host, port }) {
  return new Promise((done) => {
    const socket = connect({ host, port });
    socket.once('connect', () => {
      socket.destroy();
      done(true);
    });
    socket.once('error', () => done(false));
  });
}

// A listening port is not enough: with several emulators the CLI can still be starting others.
// Ready means the CLI has printed its "All emulators ready" banner AND every port accepts connections.
const READY_BANNER = 'All emulators ready';
let bannerSeen = false;

async function waitForReady(child) {
  const started = Date.now();
  const deadline = started + READY_TIMEOUT_MS;
  let nextHeartbeat = started + HEARTBEAT_MS;
  while (Date.now() < deadline) {
    if (Date.now() >= nextHeartbeat) {
      console.error(
        `Still waiting for emulators (${String(Math.round((Date.now() - started) / 1000))}s)...`,
      );
      nextHeartbeat += HEARTBEAT_MS;
    }
    if (child.exitCode !== null) throw new Error('Emulators exited before becoming ready');
    if (bannerSeen) {
      const ready = await Promise.all(ports.map(isListening));
      if (ready.every(Boolean)) return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Emulators not ready after ${READY_TIMEOUT_MS / 1000}s`);
}

// On Windows this force-kills the whole tree. The CLI may notice the Java emulator exiting first
// and print "Firestore Emulator has exited with code: 1 ... Fatal error": expected during
// teardown, after the test command has already finished.
function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (isWindows) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM'); // whole process group (child was started detached)
    } catch {
      // already gone
    }
  }
}

// Refuse to start if a previous run left something on our ports: tests would hit a stale emulator.
for (const p of ports) {
  if (await isListening(p)) {
    console.error(
      `Port ${p.port} (${p.name} emulator) is already in use. Stop the process holding it and retry.`,
    );
    process.exit(1);
  }
}

// Windows needs a shell to resolve npx/.cmd shims. Pass one command string there (arguments are
// fixed by this script or come from package.json, never from end users) to avoid DEP0190.
function run(file, args, options) {
  return isWindows
    ? spawn([file, ...args].join(' '), { ...options, shell: true })
    : spawn(file, args, options);
}
function runSync(file, args, options) {
  return isWindows
    ? spawnSync([file, ...args].join(' '), { ...options, shell: true })
    : spawnSync(file, args, options);
}

// Use the repo's pinned firebase-tools binary directly: `npx` can stall on a registry lookup, and
// the CLI's update check can stall on the network, both before the emulators print anything.
const firebaseBin = fileURLToPath(
  new URL(`../node_modules/.bin/firebase${isWindows ? '.cmd' : ''}`, import.meta.url),
);
const emulators = run(
  isWindows ? `"${firebaseBin}"` : firebaseBin,
  ['emulators:start', '--project', PROJECT_ID, '--only', only, '--config', configPath],
  {
    stdio: ['ignore', 'pipe', 'inherit'],
    detached: !isWindows,
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
  },
);
// Echo emulator output while watching for the ready banner (it may be split across chunks).
let recentOutput = '';
emulators.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  recentOutput = (recentOutput + chunk.toString()).slice(-4096);
  if (recentOutput.includes(READY_BANNER)) bannerSeen = true;
});

const cleanup = () => killTree(emulators);
process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

let exitCode = 1;
try {
  await waitForReady(emulators);
  const env = { ...process.env, GCLOUD_PROJECT: PROJECT_ID };
  for (const p of ports) {
    if (p.name === 'firestore') env['FIRESTORE_EMULATOR_HOST'] = `${p.host}:${String(p.port)}`;
    if (p.name === 'auth') env['FIREBASE_AUTH_EMULATOR_HOST'] = `${p.host}:${String(p.port)}`;
  }
  const [cmd, ...args] = command;
  const result = runSync(cmd, args, { stdio: 'inherit', env });
  exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  cleanup();
}

// Confirm the ports were released so the next run starts clean.
await new Promise((r) => setTimeout(r, 1000));
for (const p of ports) {
  if (await isListening(p)) {
    console.error(`Warning: port ${p.port} still in use after shutdown.`);
    exitCode = exitCode || 1;
  }
}
process.exit(exitCode);
