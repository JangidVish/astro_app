// Integration: /v1/profiles against the Firestore emulator (run via `npm test`).
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  profileListResponseSchema,
  profileSchema,
  type Profile,
} from '@astro/shared';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/common/config.js';
import { firestore } from '../../src/common/firebase.js';
import { MockProvider } from '../../src/modules/astrology-provider/mock/mock-provider.js';
import { TokenRejectedError, type TokenVerifier } from '../../src/modules/auth/verifier.js';
import { profilesModule } from '../../src/modules/birth-profiles/routes.js';
import { ProfilesService } from '../../src/modules/birth-profiles/service.js';
import { placesModule } from '../../src/modules/places/routes.js';
import { PlacesService } from '../../src/modules/places/service.js';
import { QuotaService } from '../../src/modules/quota/service.js';
import { createUsersService, usersModule } from '../../src/modules/users/routes.js';

const PROJECT_ID = 'demo-astro-app';
const EMULATOR = process.env['FIRESTORE_EMULATOR_HOST'];
const db = firestore(PROJECT_ID);
const pepper = randomBytes(32);
const NOW = new Date('2026-10-17T12:00:00Z');
// A clock that advances 1 s per reading, so createdAt values are distinct and ordering is real.
// (A frozen clock gave every profile the same createdAt, making order tests pass by luck.)
let tick = 0;
const now = () => new Date(NOW.getTime() + tick++ * 1000);

const verifier: TokenVerifier = {
  verifyIdToken: (token) =>
    token.startsWith('uid.')
      ? Promise.resolve({ uid: token.slice(4), authTime: 1 })
      : Promise.reject(new TokenRejectedError('id_token_invalid')),
  verifyAppCheckToken: () => Promise.resolve(),
};
const config = loadConfig({
  APP_ENV: 'test',
  ASTRO_PROVIDER: 'mock',
  UID_HASH_PEPPER: pepper.toString('base64'),
  FIREBASE_PROJECT_ID: PROJECT_ID,
  APP_CHECK_ENFORCED: 'false',
  LOG_LEVEL: 'silent',
});

const users = createUsersService({ db, pepper, now });
const places = new PlacesService({
  db,
  provider: new MockProvider(),
  quota: new QuotaService({ db, pepper, limitPerDay: 100, now }),
  now,
});
const profiles = new ProfilesService({ db, users, places, pepper, now });
let app: FastifyInstance;

beforeAll(async () => {
  if (!EMULATOR) throw new Error('FIRESTORE_EMULATOR_HOST is not set; run via npm test');
  app = buildApp(config, {
    deps: { verifier },
    modules: [
      usersModule({ db, pepper, now }, users),
      placesModule(places),
      profilesModule(profiles),
    ],
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  tick = 0;
  const res = await fetch(
    `http://${String(EMULATOR)}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  expect(res.ok).toBe(true);
});

// ---------------------------------------------------------------- helpers

const auth = (uid: string) => ({ authorization: `Bearer uid.${uid}` });

function call(
  uid: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) {
  return app.inject({ method, url, headers: auth(uid), ...(payload ? { payload } : {}) });
}

async function consent(uid: string) {
  const res = await call(uid, 'PATCH', '/v1/me', {
    acceptConsent: { privacyVersion: PRIVACY_POLICY_VERSION, termsVersion: TERMS_VERSION },
  });
  expect(res.statusCode).toBe(200);
}

async function placeId(uid: string, q: string): Promise<string> {
  const res = await call(uid, 'GET', `/v1/places?q=${encodeURIComponent(q)}`);
  const id = res.json<{ places: { placeId: string }[] }>().places[0]?.placeId;
  if (!id) throw new Error(`no place for ${q}`);
  return id;
}

async function body(uid: string, overrides: Record<string, unknown> = {}) {
  return {
    name: 'Asha Rao',
    relation: 'self',
    birthDate: { year: 1990, month: 5, day: 10 },
    timeKnown: true,
    birthTime: { hour: 19, minute: 55 },
    placeId: await placeId(uid, 'mumbai'),
    ...overrides,
  };
}

async function createProfile(
  uid: string,
  overrides: Record<string, unknown> = {},
): Promise<Profile> {
  const res = await call(uid, 'POST', '/v1/profiles', await body(uid, overrides));
  expect(res.statusCode, res.body).toBe(201);
  return profileSchema.parse(res.json());
}

const errorCodes = (res: { json: () => unknown }) => {
  const error = (res.json() as { error: { code: string; details?: { code: string }[] } }).error;
  return [error.code, ...(error.details ?? []).map((d) => d.code)];
};

async function seedReadings(uid: string, profileId: string) {
  const ref = db.doc(`users/${uid}/profiles/${profileId}`);
  await ref.collection('results').doc('chart_D1').set({ data: 'x' });
  await ref.collection('predictions').doc('2026-10-17').set({ data: 'y' });
}
async function readingCount(uid: string, profileId: string) {
  const ref = db.doc(`users/${uid}/profiles/${profileId}`);
  const [r, p] = await Promise.all([
    ref.collection('results').get(),
    ref.collection('predictions').get(),
  ]);
  return r.size + p.size;
}
const storedHash = async (uid: string, id: string) =>
  (await db.doc(`users/${uid}/profiles/${id}`).get()).get('inputHash') as string;
const userField = async (uid: string, field: string): Promise<unknown> =>
  (await db.doc(`users/${uid}`).get()).get(field);

// ---------------------------------------------------------------- create

describe('POST /v1/profiles', () => {
  it('requires consent first', async () => {
    await call('alice', 'GET', '/v1/me');
    const res = await call('alice', 'POST', '/v1/profiles', await body('alice'));
    expect(res.statusCode).toBe(403);
    expect(errorCodes(res)).toContain('CONSENT_REQUIRED');
  });

  it('creates a profile with resolved offset; the first one becomes primary', async () => {
    await consent('alice');
    const profile = await createProfile('alice');
    expect(profile).toMatchObject({
      name: 'Asha Rao',
      utcOffsetMinutes: 330,
      timeAssumedNoon: false,
      offsetChoice: null,
      isPrimary: true,
      place: { name: 'Mumbai', timezoneId: 'Asia/Kolkata' },
    });
    expect(profile.id).toMatch(/^[A-Za-z0-9]{20}$/);
    expect(await userField('alice', 'profileCount')).toBe(1);
    expect(await storedHash('alice', profile.id)).toMatch(/^[0-9a-f]{64}$/);
    const second = await createProfile('alice', { name: 'Ravi Rao', relation: 'partner' });
    expect(second.isPrimary).toBe(false);
  });

  it('unknown birth time: noon assumed and flagged', async () => {
    await consent('alice');
    const profile = await createProfile('alice', { timeKnown: false, birthTime: null });
    expect(profile).toMatchObject({
      timeKnown: false,
      birthTime: null,
      timeAssumedNoon: true,
      utcOffsetMinutes: 330,
    });
  });

  it.each([
    [
      'place id never returned by search',
      { placeId: `pl_${'a'.repeat(24)}` },
      'PLACE_NOT_RESOLVED',
    ],
    ['raw coordinates instead of a place', { lat: 19.07, lon: 72.88 }, 'UNKNOWN_FIELD'],
    ['future birth', { birthDate: { year: 2027, month: 1, day: 1 } }, 'DATE_IN_FUTURE'],
    [
      'time later today in India',
      { birthDate: { year: 2026, month: 10, day: 17 }, birthTime: { hour: 18, minute: 0 } },
      'DATE_IN_FUTURE',
    ],
  ])('rejects %s', async (_label, overrides, code) => {
    await consent('alice');
    const res = await call('alice', 'POST', '/v1/profiles', await body('alice', overrides));
    expect(res.statusCode).toBe(400);
    expect(errorCodes(res)).toContain(code);
  });

  it('DST gap (New York, 2021-03-14 02:30) is rejected', async () => {
    await consent('alice');
    const res = await call(
      'alice',
      'POST',
      '/v1/profiles',
      await body('alice', {
        placeId: await placeId('alice', 'new york'),
        birthDate: { year: 2021, month: 3, day: 14 },
        birthTime: { hour: 2, minute: 30 },
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(errorCodes(res)).toContain('TIME_IN_DST_GAP');
  });

  it('DST overlap needs a choice; with one it is stored with the chosen offset', async () => {
    await consent('alice');
    const overlap = {
      placeId: await placeId('alice', 'new york'),
      birthDate: { year: 2021, month: 11, day: 7 },
      birthTime: { hour: 1, minute: 30 },
    };
    const ambiguous = await call('alice', 'POST', '/v1/profiles', await body('alice', overlap));
    expect(errorCodes(ambiguous)).toContain('TIME_AMBIGUOUS');
    const later = await createProfile('alice', { ...overlap, offsetChoice: 'later' });
    expect(later).toMatchObject({ utcOffsetMinutes: -300, offsetChoice: 'later' });
  });

  it('allows 5 profiles; the 6th is refused with 409', async () => {
    await consent('alice');
    for (let i = 0; i < 5; i++)
      await createProfile('alice', { name: `Person ${String.fromCharCode(65 + i)}` });
    const res = await call('alice', 'POST', '/v1/profiles', await body('alice'));
    expect(res.statusCode).toBe(409);
    expect(errorCodes(res)).toContain('PROFILE_LIMIT_REACHED');
  });

  it('never exceeds 5 under 10 concurrent creates', { timeout: 30_000 }, async () => {
    await consent('racer');
    const payload = await body('racer');
    const results = await Promise.all(
      Array.from({ length: 10 }, () => call('racer', 'POST', '/v1/profiles', payload)),
    );
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(5);
    expect(results.filter((r) => r.statusCode === 409)).toHaveLength(5);
    expect((await db.collection('users/racer/profiles').get()).size).toBe(5);
    expect(await userField('racer', 'profileCount')).toBe(5);
  });
});

// ---------------------------------------------------------------- read

describe('GET /v1/profiles', () => {
  it('lists own profiles oldest first with the primary flagged', async () => {
    await consent('alice');
    const first = await createProfile('alice');
    await createProfile('alice', { name: 'Ravi Rao' });
    const list = profileListResponseSchema.parse(
      (await call('alice', 'GET', '/v1/profiles')).json(),
    );
    expect(list.profiles.map((p) => [p.id === first.id, p.isPrimary])).toEqual([
      [true, true],
      [false, false],
    ]);
  });
});

// ---------------------------------------------------------------- isolation

describe('cross-user isolation', () => {
  it('another user cannot read, edit or delete a profile, and gets 404 (existence not revealed)', async () => {
    await consent('alice');
    const profile = await createProfile('alice');
    const url = `/v1/profiles/${profile.id}`;
    expect((await call('mallory', 'GET', url)).statusCode).toBe(404);
    expect((await call('mallory', 'PATCH', url, { name: 'Hacked' })).statusCode).toBe(404);
    expect((await call('mallory', 'DELETE', url)).statusCode).toBe(404);
    expect((await call('mallory', 'GET', '/v1/profiles')).json()).toEqual({ profiles: [] });
    expect((await call('alice', 'GET', url)).json()).toMatchObject({ name: 'Asha Rao' });
  });

  it.each(['..%2F..%2Fusers%2Fbob', 'abc', 'a'.repeat(21), 'AAAAAAAAAAAAAAAAAAA%2F'])(
    'malformed id %s is a 404 and never addresses another path',
    async (id) => {
      expect((await call('alice', 'GET', `/v1/profiles/${id}`)).statusCode).toBe(404);
    },
  );
});

// ---------------------------------------------------------------- update

describe('PATCH /v1/profiles/:id', () => {
  it('a name-only edit keeps the input hash and cached readings', async () => {
    await consent('alice');
    const profile = await createProfile('alice');
    const hash = await storedHash('alice', profile.id);
    await seedReadings('alice', profile.id);
    const res = await call('alice', 'PATCH', `/v1/profiles/${profile.id}`, { name: 'Asha R' });
    expect(res.json()).toMatchObject({ name: 'Asha R', utcOffsetMinutes: 330 });
    expect(await storedHash('alice', profile.id)).toBe(hash);
    expect(await readingCount('alice', profile.id)).toBe(2);
  });

  it('a birth-data edit changes the hash and deletes stale readings', async () => {
    await consent('alice');
    const profile = await createProfile('alice');
    const hash = await storedHash('alice', profile.id);
    await seedReadings('alice', profile.id);
    const res = await call('alice', 'PATCH', `/v1/profiles/${profile.id}`, {
      birthDate: { year: 1991, month: 5, day: 10 },
    });
    expect(res.statusCode).toBe(200);
    expect(await storedHash('alice', profile.id)).not.toBe(hash);
    expect(await readingCount('alice', profile.id)).toBe(0);
  });

  it('switching to unknown time assumes noon', async () => {
    await consent('alice');
    const profile = await createProfile('alice');
    const res = await call('alice', 'PATCH', `/v1/profiles/${profile.id}`, {
      timeKnown: false,
      birthTime: null,
    });
    expect(res.json()).toMatchObject({ timeKnown: false, birthTime: null, timeAssumedNoon: true });
  });

  it('an edit that makes the time ambiguous asks for a choice and changes nothing', async () => {
    await consent('alice');
    const profile = await createProfile('alice', {
      placeId: await placeId('alice', 'new york'),
      birthDate: { year: 2021, month: 11, day: 7 },
      birthTime: { hour: 3, minute: 0 },
    });
    const res = await call('alice', 'PATCH', `/v1/profiles/${profile.id}`, {
      timeKnown: true,
      birthTime: { hour: 1, minute: 30 },
    });
    expect(errorCodes(res)).toContain('TIME_AMBIGUOUS');
    expect((await call('alice', 'GET', `/v1/profiles/${profile.id}`)).json()).toMatchObject({
      birthTime: { hour: 3, minute: 0 },
    });
  });

  it('moving the place re-resolves the offset (Mumbai -> London)', async () => {
    await consent('alice');
    const profile = await createProfile('alice');
    const res = await call('alice', 'PATCH', `/v1/profiles/${profile.id}`, {
      placeId: await placeId('alice', 'london'),
    });
    expect(res.json()).toMatchObject({ place: { name: 'London' }, utcOffsetMinutes: 60 });
  });
});

// ---------------------------------------------------------------- delete

describe('DELETE /v1/profiles/:id', () => {
  it('deletes the profile and its readings, decrements the count, audits', async () => {
    await consent('alice');
    const profile = await createProfile('alice');
    await seedReadings('alice', profile.id);
    expect((await call('alice', 'DELETE', `/v1/profiles/${profile.id}`)).statusCode).toBe(204);
    expect((await call('alice', 'GET', `/v1/profiles/${profile.id}`)).statusCode).toBe(404);
    expect(await readingCount('alice', profile.id)).toBe(0);
    expect(await userField('alice', 'profileCount')).toBe(0);
    expect(await userField('alice', 'primaryProfileId')).toBeNull();
    const audit = await db.collection('auditEvents').where('type', '==', 'profile_deleted').get();
    expect(audit.size).toBe(1);
  });

  it('deleting the primary promotes the oldest remaining profile (not the newest)', async () => {
    await consent('alice');
    const a = await createProfile('alice', { name: 'Person A' });
    const b = await createProfile('alice', { name: 'Person B' });
    await createProfile('alice', { name: 'Person C' });
    await call('alice', 'DELETE', `/v1/profiles/${a.id}`);
    expect(await userField('alice', 'primaryProfileId')).toBe(b.id);
    expect((await call('alice', 'GET', `/v1/profiles/${b.id}`)).json()).toMatchObject({
      isPrimary: true,
    });
  });

  it('frees a slot: after deleting, a 6th create succeeds', async () => {
    await consent('alice');
    const created = [];
    for (let i = 0; i < 5; i++)
      created.push(await createProfile('alice', { name: `Person ${String.fromCharCode(65 + i)}` }));
    await call('alice', 'DELETE', `/v1/profiles/${created[2]?.id ?? ''}`);
    await createProfile('alice', { name: 'Person F' });
    expect(await userField('alice', 'profileCount')).toBe(5);
  });

  it('deleting twice is a 404 the second time and does not corrupt the count', async () => {
    await consent('alice');
    const profile = await createProfile('alice');
    await call('alice', 'DELETE', `/v1/profiles/${profile.id}`);
    expect((await call('alice', 'DELETE', `/v1/profiles/${profile.id}`)).statusCode).toBe(404);
    expect(await userField('alice', 'profileCount')).toBe(0);
  });
});

// ---------------------------------------------------------------- readings helper

describe('ProfilesService.loadForReadings', () => {
  it('returns provider birth input, with noon for unknown time', async () => {
    await consent('alice');
    const known = await createProfile('alice');
    const unknown = await createProfile('alice', {
      name: 'Person U',
      timeKnown: false,
      birthTime: null,
    });
    expect((await profiles.loadForReadings('alice', known.id)).birth).toEqual({
      date: { year: 1990, month: 5, day: 10 },
      time: { hour: 19, minute: 55 },
      lat: 19.0728,
      lon: 72.8826,
      utcOffsetMinutes: 330,
    });
    expect(await profiles.loadForReadings('alice', unknown.id)).toMatchObject({
      timeKnown: false,
      timeAssumedNoon: true,
      birth: { time: { hour: 12, minute: 0 } },
    });
  });
});
