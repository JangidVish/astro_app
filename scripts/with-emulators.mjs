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
import { resolve } from 'node:path';

const PROJECT_ID = 'demo-astro-app';
const READY_TIMEOUT_MS = 120_000;
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
  return { name, host: entry.host ?? '127.0.0.1', port: entry.port };
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

async function waitForPorts(child) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Emulators exited before becoming ready');
    const ready = await Promise.all(ports.map(isListening));
    if (ready.every(Boolean)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Emulators not ready after ${READY_TIMEOUT_MS / 1000}s`);
}

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

const emulators = run(
  'npx',
  ['firebase', 'emulators:start', '--project', PROJECT_ID, '--only', only, '--config', configPath],
  { stdio: ['ignore', 'inherit', 'inherit'], detached: !isWindows },
);

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
  await waitForPorts(emulators);
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
