#!/usr/bin/env node
// Local development for a real phone on the same Wi-Fi: starts the Auth and Firestore emulators
// and the API (with watch), with the API and the Auth emulator reachable on the LAN.
// The app finds this computer by itself (see apps/mobile/src/lib/config.ts).
//
// Usage: npm run dev:lan   (then, in another terminal: npm run start --workspace @astro/mobile)
//
// Only use this on a network you trust: the Auth emulator accepts unsigned tokens, so anyone on
// the same network could act as any test user. Data is emulator-only and nothing leaves the PC.
import { spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal)
  .map((a) => a.address);

console.log(`
Phone testing on your local network
  This PC: ${addresses.join(', ') || '(no network address found)'}
  API:  http://<this PC>:8080   Auth emulator: http://<this PC>:9099
  1. Phone and PC on the same Wi-Fi (Windows network profile: Private).
  2. Allow Node.js and Java through Windows Firewall when asked (Private networks only).
  3. Another terminal: npm run start --workspace @astro/mobile, then scan the QR code with Expo Go.
  Trusted networks only: the emulator accepts unsigned tokens. Ctrl+C stops everything.
`);

const child = spawn(
  process.execPath,
  [
    'scripts/with-emulators.mjs',
    '--config',
    'infra/firebase/firebase.lan.json',
    '--only',
    'auth,firestore',
    '--',
    'npm',
    'run',
    'dev',
    '--workspace',
    '@astro/api',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      // Environment values win over services/api's .env file.
      APP_ENV: 'local',
      LISTEN_ON_LAN: 'true',
      FIREBASE_PROJECT_ID: 'demo-astro-app',
      APP_CHECK_ENFORCED: 'false',
    },
  },
);
child.on('exit', (code) => process.exit(code ?? 1));
