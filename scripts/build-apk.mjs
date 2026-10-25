#!/usr/bin/env node
// Builds the installable Android APK on Expo's servers (EAS Build, "preview" profile).
// Checks apps/mobile/eas.json first, so a build never starts with placeholder settings: a free
// build can wait in a queue for a long time before it would fail.
//
// Usage: npm run build:apk   (needs `npm install -g eas-cli` and `eas login` once)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MOBILE = resolve('apps/mobile');
const eas = JSON.parse(readFileSync(resolve(MOBILE, 'eas.json'), 'utf8'));
const env = eas.build?.preview?.env ?? {};

const REQUIRED = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
];
const problems = [];
for (const key of REQUIRED) {
  const value = String(env[key] ?? '');
  if (!value || value.includes('REPLACE')) problems.push(`${key} is not filled in`);
}
const apiUrl = String(env.EXPO_PUBLIC_API_URL ?? '');
if (apiUrl && !apiUrl.includes('REPLACE') && !apiUrl.startsWith('https://')) {
  problems.push('EXPO_PUBLIC_API_URL must start with https://');
}
if (problems.length > 0) {
  console.error('Fill in apps/mobile/eas.json (build.preview.env) first:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`Building the APK for ${apiUrl} ...`);
const args = ['build', '--platform', 'android', '--profile', 'preview'];
// Windows needs a shell to run the eas.cmd shim; pass one command string there (fixed arguments).
const result =
  process.platform === 'win32'
    ? spawnSync(['eas', ...args].join(' '), { cwd: MOBILE, stdio: 'inherit', shell: true })
    : spawnSync('eas', args, { cwd: MOBILE, stdio: 'inherit' });
if (result.error || result.status === null) {
  console.error('Could not run "eas". Install it once with: npm install -g eas-cli');
  process.exit(1);
}
process.exit(result.status);
