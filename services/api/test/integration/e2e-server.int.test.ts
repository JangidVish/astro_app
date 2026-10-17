// T9.3 API end-to-end: starts the real entry point (src/server.ts, wired exactly as deployed)
// as a child process on the emulators with the mock provider, signs up a real Auth-emulator
// user and walks the whole journey over HTTP with genuine Firebase ID tokens:
// register -> consent -> place -> profile -> charts -> dasha -> prediction -> delete account.
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { getAuth } from 'firebase-admin/auth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  antardashaResponseSchema,
  chartResponseSchema,
  mahadashaResponseSchema,
  meResponseSchema,
  placeSearchResponseSchema,
  predictionResponseSchema,
  profileListResponseSchema,
  profileSchema,
} from '@astro/shared';
import { firebaseApp } from '../../src/common/firebase.js';
import { PROJECT_ID, db, resetEmulator } from './harness.js';

const AUTH = process.env['FIREBASE_AUTH_EMULATOR_HOST'];
const EMAIL = `e2e.${randomBytes(4).toString('hex')}@example.com`;
const NAME = 'Meera Iyer';

let server: ChildProcess;
let base = '';
const output: string[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close(() => {
        resolve(port);
      });
    });
  });
}

async function waitForHealth(deadline: number): Promise<void> {
  for (;;) {
    try {
      if ((await fetch(`${base}/healthz`)).ok) return;
    } catch {
      // not listening yet
    }
    if (server.exitCode !== null || Date.now() > deadline)
      throw new Error(`server did not start:\n${output.join('')}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/** Creates an email/password user on the Auth emulator and returns a real ID token. */
async function signUp(): Promise<{ idToken: string; localId: string }> {
  const res = await fetch(
    `http://${AUTH ?? ''}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: 'correct horse 42', returnSecureToken: true }),
    },
  );
  expect(res.ok).toBe(true);
  return res.json() as Promise<{ idToken: string; localId: string }>;
}

beforeAll(async () => {
  if (!AUTH || !process.env['FIRESTORE_EMULATOR_HOST']) {
    throw new Error('Emulators are not set up; run via npm test');
  }
  await resetEmulator();
  const port = await freePort();
  base = `http://127.0.0.1:${String(port)}`;
  // Never hand real provider credentials to the server under test.
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('ASTROLOGYAPI_')),
  );
  server = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    env: {
      ...inherited,
      APP_ENV: 'local',
      PORT: String(port),
      ASTRO_PROVIDER: 'mock',
      UID_HASH_PEPPER: randomBytes(32).toString('base64'),
      FIREBASE_PROJECT_ID: PROJECT_ID,
      APP_CHECK_ENFORCED: 'false',
      LOG_LEVEL: 'info',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (chunk: Buffer) => output.push(chunk.toString()));
  server.stderr?.on('data', (chunk: Buffer) => output.push(chunk.toString()));
  await waitForHealth(Date.now() + 60_000);
}, 90_000);

afterAll(async () => {
  if (server.exitCode === null) {
    const exited = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await exited;
  }
});

describe('full user journey against the real server entry point', () => {
  it('register, consent, profile, readings, delete; logs stay free of personal data', async () => {
    const { idToken, localId } = await signUp();
    const call = async (method: string, path: string, body?: object) => {
      const res = await fetch(base + path, {
        method,
        headers: {
          authorization: `Bearer ${idToken}`,
          ...(body ? { 'content-type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const text = await res.text();
      return { status: res.status, json: () => JSON.parse(text) as unknown, text };
    };

    // Unauthenticated requests are refused by the real wiring too.
    expect((await fetch(`${base}/v1/me`)).status).toBe(401);

    const me = meResponseSchema.parse((await call('GET', '/v1/me')).json());
    expect(me.consentRequired).toBe(true);
    const consented = await call('PATCH', '/v1/me', {
      acceptConsent: { privacyVersion: PRIVACY_POLICY_VERSION, termsVersion: TERMS_VERSION },
    });
    expect(consented.status, consented.text).toBe(200);
    expect(meResponseSchema.parse(consented.json()).consentRequired).toBe(false);

    const search = placeSearchResponseSchema.parse(
      (await call('GET', '/v1/places?q=mumbai')).json(),
    );
    const placeId = search.places.find((p) => p.name === 'Mumbai')?.placeId;
    expect(placeId).toBeDefined();

    const created = await call('POST', '/v1/profiles', {
      name: NAME,
      relation: 'self',
      birthDate: { year: 1988, month: 11, day: 3 },
      timeKnown: true,
      birthTime: { hour: 6, minute: 41 },
      placeId,
    });
    expect(created.status, created.text).toBe(201);
    const profile = profileSchema.parse(created.json());
    expect(profile.utcOffsetMinutes).toBe(330);
    const list = profileListResponseSchema.parse((await call('GET', '/v1/profiles')).json());
    expect(list.profiles.map((p) => p.id)).toEqual([profile.id]);

    const d1 = chartResponseSchema.parse(
      (await call('GET', `/v1/profiles/${profile.id}/chart?type=D1`)).json(),
    );
    expect(d1.houses).toHaveLength(12);
    const d9 = chartResponseSchema.parse(
      (await call('GET', `/v1/profiles/${profile.id}/chart?type=D9`)).json(),
    );
    expect(d9.type).toBe('D9');
    // Reopening a saved reading returns the stored copy.
    const again = chartResponseSchema.parse(
      (await call('GET', `/v1/profiles/${profile.id}/chart?type=D1`)).json(),
    );
    expect(again).toEqual(d1);

    const dasha = mahadashaResponseSchema.parse(
      (await call('GET', `/v1/profiles/${profile.id}/dasha`)).json(),
    );
    expect(dasha.mahadashas).toHaveLength(9);
    const lord = dasha.mahadashas[0]?.lord ?? 'Sun';
    antardashaResponseSchema.parse(
      (await call('GET', `/v1/profiles/${profile.id}/dasha/${lord}`)).json(),
    );

    const today = new Date().toISOString().slice(0, 10);
    const prediction = await call('GET', `/v1/profiles/${profile.id}/prediction?date=${today}`);
    expect(prediction.status, prediction.text).toBe(200);
    predictionResponseSchema.parse(prediction.json());

    // Account deletion removes the Auth user and every stored document.
    expect((await call('DELETE', '/v1/me')).status).toBe(204);
    await expect(getAuth(firebaseApp(PROJECT_ID)).getUser(localId)).rejects.toMatchObject({
      code: 'auth/user-not-found',
    });
    expect((await call('GET', '/v1/profiles')).status).toBe(401);
    const leftovers = await db.collectionGroup('profiles').get();
    expect(leftovers.docs.filter((d) => d.ref.path.includes(localId))).toEqual([]);

    const logs = output.join('');
    expect(logs).toContain('"statusCode":200'); // request logging really was on
    for (const secret of [EMAIL, NAME, 'Meera', idToken, '1988', '06:41', localId]) {
      expect(logs, 'server log contains personal data').not.toContain(secret);
    }
  }, 60_000);
});
