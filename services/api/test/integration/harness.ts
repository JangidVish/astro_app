// Shared setup for integration tests: the full app wired like server.ts, but with a fake token
// verifier, an injectable clock and a MockProvider (or subclass). Requires the Firestore emulator.
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@astro/shared';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/common/config.js';
import { firestore } from '../../src/common/firebase.js';
import { MockProvider } from '../../src/modules/astrology-provider/mock/mock-provider.js';
import { TokenRejectedError, type TokenVerifier } from '../../src/modules/auth/verifier.js';
import { profilesModule } from '../../src/modules/birth-profiles/routes.js';
import { ProfilesService } from '../../src/modules/birth-profiles/service.js';
import { chartsModule } from '../../src/modules/charts/routes.js';
import { ChartsService } from '../../src/modules/charts/service.js';
import { dashaModule } from '../../src/modules/dasha/routes.js';
import { DashaService } from '../../src/modules/dasha/service.js';
import { placesModule } from '../../src/modules/places/routes.js';
import { PlacesService } from '../../src/modules/places/service.js';
import { predictionsModule } from '../../src/modules/predictions/routes.js';
import { PredictionsService } from '../../src/modules/predictions/service.js';
import { QuotaService } from '../../src/modules/quota/service.js';
import { ReadingsCache } from '../../src/modules/readings/cache.js';
import { AccountDeletionService } from '../../src/modules/users/deletion.js';
import { createUsersService, usersModule } from '../../src/modules/users/routes.js';

export const PROJECT_ID = 'demo-astro-app';
export const db = firestore(PROJECT_ID);

/** Fake verifier: token "uid.<id>" authenticates as <id> (signed in "now"). */
const verifier: TokenVerifier = {
  verifyIdToken: (token) =>
    token.startsWith('uid.')
      ? Promise.resolve({ uid: token.slice(4), authTime: Math.floor(Date.now() / 1000) })
      : Promise.reject(new TokenRejectedError('id_token_invalid')),
  verifyAppCheckToken: () => Promise.resolve(),
};

export interface Harness {
  app: FastifyInstance;
  provider: MockProvider;
  quota: QuotaService;
  pepper: Buffer;
  /** Sets the clock; it then advances 1 s per reading so createdAt values stay distinct. */
  setNow(at: Date): void;
}

export async function createHarness(
  provider: MockProvider = new MockProvider(),
  options: { logLines?: string[]; logLevel?: string } = {},
): Promise<Harness> {
  if (!process.env['FIRESTORE_EMULATOR_HOST']) throw new Error('Run via npm test (emulators)');
  const pepper = randomBytes(32);
  let base = new Date('2026-10-17T12:00:00Z').getTime();
  let tick = 0;
  const now = () => new Date(base + tick++ * 1000);
  provider.clock = () => new Date(base + tick * 1000);

  const config = loadConfig({
    APP_ENV: 'test',
    ASTRO_PROVIDER: 'mock',
    UID_HASH_PEPPER: pepper.toString('base64'),
    FIREBASE_PROJECT_ID: PROJECT_ID,
    APP_CHECK_ENFORCED: 'false',
    LOG_LEVEL: options.logLevel ?? 'silent',
  });
  const quota = new QuotaService({ db, pepper, limitPerDay: 100, now });
  const users = createUsersService({ db, pepper, now });
  const places = new PlacesService({ db, provider, quota, now });
  const profiles = new ProfilesService({ db, users, places, pepper, now });
  const cache = new ReadingsCache({ db, quota, source: provider.source, now });
  const logLines = options.logLines;
  const app = buildApp(config, {
    ...(logLines ? { logStream: { write: (line: string) => logLines.push(line) } } : {}),
    deps: { verifier },
    modules: [
      usersModule(
        {
          db,
          pepper,
          now,
          // Auth accounts are not created in these tests; deletion only needs a no-op admin.
          deletion: new AccountDeletionService({
            db,
            pepper,
            now,
            authAdmin: {
              deleteUser: () => Promise.resolve(),
              exists: () => Promise.resolve(false),
            },
          }),
        },
        users,
      ),
      placesModule(places),
      profilesModule(profiles),
      chartsModule(new ChartsService({ profiles, provider, cache })),
      dashaModule(new DashaService({ profiles, provider, cache, now })),
      predictionsModule(new PredictionsService({ profiles, provider, cache, now })),
    ],
  });
  await app.ready();
  return {
    app,
    provider,
    quota,
    pepper,
    setNow(at: Date) {
      base = at.getTime();
      tick = 0;
    },
  };
}

export async function resetEmulator(): Promise<void> {
  const host = process.env['FIRESTORE_EMULATOR_HOST'] ?? '';
  const res = await fetch(
    `http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  expect(res.ok).toBe(true);
}

export function caller(app: FastifyInstance, uid: string) {
  return (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer uid.${uid}` },
      ...(payload ? { payload } : {}),
    });
}

/** Consents and creates a profile (Mumbai, 1990-05-10 19:55 by default); returns its id. */
export async function createProfile(
  h: Harness,
  uid: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const call = caller(h.app, uid);
  await call('PATCH', '/v1/me', {
    acceptConsent: { privacyVersion: PRIVACY_POLICY_VERSION, termsVersion: TERMS_VERSION },
  });
  const search = await call('GET', '/v1/places?q=mumbai');
  const placeId = search.json<{ places: { placeId: string }[] }>().places[0]?.placeId;
  const res = await call('POST', '/v1/profiles', {
    name: 'Asha Rao',
    relation: 'self',
    birthDate: { year: 1990, month: 5, day: 10 },
    timeKnown: true,
    birthTime: { hour: 19, minute: 55 },
    placeId,
    ...overrides,
  });
  expect(res.statusCode, res.body).toBe(201);
  h.provider.reset(); // count only calls made after setup
  return res.json<{ id: string }>().id;
}
