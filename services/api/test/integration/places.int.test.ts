// Integration: place search and resolution against the Firestore emulator (run via `npm test`).
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { placeSearchResponseSchema } from '@astro/shared';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/common/config.js';
import { AppError } from '../../src/common/errors.js';
import { firestore } from '../../src/common/firebase.js';
import { ProviderError } from '../../src/modules/astrology-provider/errors.js';
import { MockProvider } from '../../src/modules/astrology-provider/mock/mock-provider.js';
import type {
  AstrologyProvider,
  ProviderPlace,
  ProviderResult,
} from '../../src/modules/astrology-provider/provider.js';
import { TokenRejectedError, type TokenVerifier } from '../../src/modules/auth/verifier.js';
import { placesModule } from '../../src/modules/places/routes.js';
import { PlacesService } from '../../src/modules/places/service.js';
import { QuotaService } from '../../src/modules/quota/service.js';

const PROJECT_ID = 'demo-astro-app';
const EMULATOR = process.env['FIRESTORE_EMULATOR_HOST'];
const db = firestore(PROJECT_ID);
const pepper = randomBytes(32);

let clock = new Date('2026-10-17T12:00:00Z');
const now = () => clock;

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

const mock = new MockProvider();
const quota = new QuotaService({ db, pepper, limitPerDay: 5, now });
const service = new PlacesService({ db, provider: mock, quota, now });
let app: FastifyInstance;

beforeAll(async () => {
  if (!EMULATOR) throw new Error('FIRESTORE_EMULATOR_HOST is not set; run via npm test');
  app = buildApp(config, { deps: { verifier }, modules: [placesModule(service)] });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  clock = new Date('2026-10-17T12:00:00Z');
  mock.reset();
  const res = await fetch(
    `http://${String(EMULATOR)}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  expect(res.ok).toBe(true);
});

const search = (q: string, uid = 'alice') =>
  app.inject({
    method: 'GET',
    url: `/v1/places?q=${encodeURIComponent(q)}`,
    headers: { authorization: `Bearer uid.${uid}` },
  });

/** MockProvider whose place search returns fixed places (or fails), for cases the mock cannot produce. */
class StubPlacesProvider extends MockProvider {
  constructor(private readonly result: ProviderPlace[] | ProviderError) {
    super();
  }

  override searchPlaces(): Promise<ProviderResult<ProviderPlace[]>> {
    return this.result instanceof ProviderError
      ? Promise.reject(this.result)
      : Promise.resolve({ data: this.result, raw: {}, source: 'mock', endpoint: 'geo_details' });
  }
}
const stubProvider = (result: ProviderPlace[] | ProviderError): AstrologyProvider =>
  new StubPlacesProvider(result);

describe('GET /v1/places', () => {
  it('returns places in the shared contract shape with stable ids', async () => {
    const res = await search('mum');
    expect(res.statusCode).toBe(200);
    const body = placeSearchResponseSchema.parse(res.json());
    expect(body.places.map((p) => p.name)).toEqual(['Mumbai', 'Navi Mumbai']);
    expect(body.places[0]?.placeId).toMatch(/^pl_[0-9a-f]{24}$/);
  });

  it('serves repeats from cache: one provider call and one quota unit in total', async () => {
    await search('mum');
    await search('  MUM ');
    await search('Mum', 'bob'); // cache is shared across users: place results are not personal
    expect(mock.callCount('searchPlaces')).toBe(1);
    expect(await quota.usedToday('alice')).toBe(1);
    expect(await quota.usedToday('bob')).toBe(0);
  });

  it('gives the same placeId for the same place across different searches', async () => {
    const a = placeSearchResponseSchema.parse((await search('mum')).json()).places[0];
    const b = placeSearchResponseSchema.parse((await search('mumbai')).json()).places[0];
    expect(a?.placeId).toBe(b?.placeId);
  });

  it('refetches after the 30-day cache expires', async () => {
    await search('pune');
    clock = new Date('2026-11-17T12:00:01Z');
    await search('pune');
    expect(mock.callCount('searchPlaces')).toBe(2);
  });

  it('caches empty results for 1 day only', async () => {
    await search('atlantis');
    await search('atlantis');
    expect(mock.callCount('searchPlaces')).toBe(1);
    clock = new Date('2026-10-18T12:00:01Z');
    await search('atlantis');
    expect(mock.callCount('searchPlaces')).toBe(2);
  });

  it.each([
    ['too short', 'mu', 'QUERY_TOO_SHORT'],
    ['only spaces around 2 letters', '  mu  ', 'QUERY_TOO_SHORT'],
    ['too long', 'x'.repeat(101), 'QUERY_TOO_LONG'],
  ])('rejects a %s query with 400 before any provider call', async (_label, q, code) => {
    const res = await search(q);
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).toContain(code);
    expect(mock.callCount()).toBe(0);
  });

  it('provider down: 503, nothing cached, quota refunded', async () => {
    mock.failNext('searchPlaces', 'timeout');
    const res = await search('london');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'PROVIDER_UNAVAILABLE', retryable: true } });
    expect(await quota.usedToday('alice')).toBe(0);
    expect((await db.collection('places').get()).size).toBe(0);
    // The next attempt goes to the provider again (failures are not cached).
    expect((await search('london')).statusCode).toBe(200);
    expect(mock.callCount('searchPlaces')).toBe(2);
  });

  it('over quota: 429 and no provider call', async () => {
    for (let i = 0; i < 5; i++) await quota.reserve('carol');
    const res = await search('kathmandu', 'carol');
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(mock.callCount('searchPlaces')).toBe(0);
  });

  it('requires authentication', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/places?q=mum' })).statusCode).toBe(401);
  });
});

describe('PlacesService: provider data hygiene', () => {
  it('drops places with unusable timezones or coordinates', async () => {
    const svc = new PlacesService({
      db,
      quota,
      now,
      provider: stubProvider([
        { name: 'Good', countryCode: 'IN', lat: 19.1, lon: 72.9, timezoneId: 'Asia/Kolkata' },
        { name: 'Abbrev zone', countryCode: 'IN', lat: 19.1, lon: 72.9, timezoneId: 'IST' },
        { name: 'Unknown zone', countryCode: 'XX', lat: 1, lon: 1, timezoneId: 'Mars/Olympus' },
        { name: 'Bad lat', countryCode: 'IN', lat: 123, lon: 72.9, timezoneId: 'Asia/Kolkata' },
      ]),
    });
    expect((await svc.search('alice', 'mixed')).map((p) => p.name)).toEqual(['Good']);
  });

  it('rounds coordinates to 4 decimal places', async () => {
    const svc = new PlacesService({
      db,
      quota,
      now,
      provider: stubProvider([
        {
          name: 'Precise',
          countryCode: 'IN',
          lat: 19.0728312,
          lon: 72.8826187,
          timezoneId: 'Asia/Kolkata',
        },
      ]),
    });
    expect((await svc.search('alice', 'precise'))[0]).toMatchObject({ lat: 19.0728, lon: 72.8826 });
  });

  it('malformed provider data: 502 PROVIDER_ERROR, quota refunded', async () => {
    const svc = new PlacesService({
      db,
      quota,
      now,
      provider: stubProvider(new ProviderError('malformed', 'geo_details')),
    });
    await expect(svc.search('alice', 'broken')).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      status: 502,
    });
    expect(await quota.usedToday('alice')).toBe(0);
  });
});

describe('PlacesService.resolvePlace', () => {
  it('resolves a place returned by a search', async () => {
    const [mumbai] = await service.search('alice', 'mumbai');
    expect(await service.resolvePlace(mumbai?.placeId ?? '')).toEqual(mumbai);
  });

  it.each([
    ['unknown id', `pl_${'0'.repeat(24)}`],
    ['malformed id', 'pl_xyz'],
    ['path traversal attempt', '../users/alice'],
    ['empty', ''],
  ])('rejects %s with 400 PLACE_NOT_RESOLVED', async (_label, id) => {
    const error = await service.resolvePlace(id).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ code: 'PLACE_NOT_RESOLVED', status: 400 });
  });

  it('rejects a place whose cache entry has expired', async () => {
    const [mumbai] = await service.search('alice', 'mumbai');
    clock = new Date('2026-11-17T12:00:01Z');
    await expect(service.resolvePlace(mumbai?.placeId ?? '')).rejects.toMatchObject({
      code: 'PLACE_NOT_RESOLVED',
    });
  });
});
