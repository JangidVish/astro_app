#!/usr/bin/env node
// Builds the mobile JS bundle and fails if it contains secrets (NFR-1: provider keys and other
// secrets live on the server only). Checks two things:
//  1. the value of every non-public env var whose name looks secret (KEY, SECRET, PEPPER, TOKEN,
//     PASSWORD) that is set in this environment (run with --env-file=.env locally);
//  2. marker strings that should never ship (private key headers, server-only variable names).
// Values are compared in memory and never printed.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const MOBILE = resolve('apps/mobile');
const out = mkdtempSync(join(tmpdir(), 'astro-bundle-'));
const isWindows = process.platform === 'win32';

const args = ['expo', 'export', '--platform', 'android', '--output-dir', JSON.stringify(out)];
// Windows needs a shell for npx; pass one command string there (fixed arguments, no user input).
const build = isWindows
  ? spawnSync(['npx', ...args].join(' '), {
      cwd: MOBILE,
      stdio: ['ignore', 'ignore', 'inherit'],
      shell: true,
    })
  : spawnSync(
      'npx',
      args.map((a) => a.replace(/^"|"$/g, '')),
      { cwd: MOBILE, stdio: ['ignore', 'ignore', 'inherit'] },
    );
if (build.status !== 0) {
  console.error('Bundle build failed.');
  process.exit(1);
}

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const bundleText = files(out)
  .filter((f) => /\.(hbc|js|map|json)$/.test(f))
  .map((f) => readFileSync(f).toString('latin1'))
  .join('\n');
rmSync(out, { recursive: true, force: true });

const problems = [];
const SECRET_NAME = /(KEY|SECRET|PEPPER|TOKEN|PASSWORD)/;
for (const [name, value] of Object.entries(process.env)) {
  if (name.startsWith('EXPO_PUBLIC_') || !SECRET_NAME.test(name)) continue;
  if (!value || value.length < 8 || value.startsWith('<')) continue;
  if (bundleText.includes(value)) problems.push(`value of ${name}`);
}
for (const marker of ['-----BEGIN', 'private_key', 'ASTROLOGYAPI_API_KEY', 'UID_HASH_PEPPER']) {
  if (bundleText.includes(marker)) problems.push(`marker "${marker}"`);
}

if (bundleText.length < 100_000) {
  console.error('Bundle looks empty; refusing to report a clean result.');
  process.exit(1);
}
if (problems.length > 0) {
  console.error(`Secrets found in the mobile bundle: ${problems.join(', ')}`);
  process.exit(1);
}
console.log(`Mobile bundle clean (${String(Math.round(bundleText.length / 1024))} KB scanned).`);
