// Integration: charts, planets, readings cache and provider call log (Firestore emulator).
import { randomBytes } from 'node:crypto';
import type { Timestamp } from 'firebase-admin/firestore';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  GRAHAS,
  PRIVACY_POLICY_VERSION,
  TERMS_VERSION,
  chartResponseSchema,
  planetsResponseSchema,
  type ChartType,
} from '@astro/shared';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/common/config.js';
import { firestore } from '../../src/common/firebase.js';
import { uidHash } from '../../src/common/hashing.js';
import { runWithContext } from '../../src/common/request-context.js';
import { ProviderCallLog } from '../../src/modules/astrology-provider/call-log.js';
import { MockProvider } from '../../src/modules/astrology-provider/mock/mock-provider.js';
import type { BirthInput } from '../../src/modules/astrology-provider/provider.js';
import { TokenRejectedError, type TokenVerifier } from '../../src/modules/auth/verifier.js';
import { profilesModule } from '../../src/modules/birth-profiles/routes.js';
import { ProfilesService } from '../../src/modules/birth-profiles/service.js';
import { chartsModule } from '../../src/modules/charts/routes.js';
import { ChartsService } from '../../src/modules/charts/service.js';
import { placesModule } from '../../src/modules/places/routes.js';
import { PlacesService } from '../../src/modules/places/service.js';
import { QuotaService } from '../../src/modules/quota/service.js';
import { ReadingsCache } from '../../src/modules/readings/cache.js';
import { createUsersService, usersModule } from '../../src/modules/users/routes.js';

const PROJECT_ID = 'demo-astro-app';
const FS = process.env['FIRESTORE_EMULATOR_HOST'];
const db = firestore(PROJECT_ID);
const pepper = randomBytes(32);
const NOW = new Date('2026-10-17T12:00:00Z');
let tick = 0;
const now = () => new Date(NOW.getTime() + tick++ * 1000);

/** MockProvider whose getChart can be held until released, to edit a profile mid-fetch. */
class GatedProvider extends MockProvider {
  private gate: Promise<void> | null = null;
  private open: (() => void) | null = null;
  hold(): void {
    this.gate = new Promise((resolve) => (this.open = resolve));
  }
  release(): void {
    this.open?.();
    this.gate = null;
  }
  override async getChart(input: BirthInput, type: ChartType) {
    const result = await super.getChart(input, type);
    if (this.gate) await this.gate;
    return result;
  }
}

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

const provider = new GatedProvider();
const quota = new QuotaService({ db, pepper, limitPerDay: 100, now });
const users = createUsersService({ db, pepper, now });
const places = new PlacesService({ db, provider, quota, now });
const profiles = new ProfilesService({ db, users, places, pepper, now });
const cache = new ReadingsCache({ db, quota, source: provider.source, now });
const charts = new ChartsService({ profiles, provider, cache });
let app: FastifyInstance;

beforeAll(async () => {
  if (!FS) throw new Error('FIRESTORE_EMULATOR_HOST is not set; run via npm test');
  app = buildApp(config, {
    deps: { verifier },
    modules: [
      usersModule({ db, pepper, now }, users),
      placesModule(places),
      profilesModule(profiles),
      chartsModule(charts),
    ],
  });
  await app.ready();
});
afterAll(async () => {
  await app.close();
});
beforeEach(async () => {
  tick = 0;
  provider.reset();
  provider.release();
  const res = await fetch(
    `http://${String(FS)}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  expect(res.ok).toBe(true);
});

const call = (uid: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer uid.${uid}` },
    ...(payload ? { payload } : {}),
  });

async function newProfile(uid: string, overrides: Record<string, unknown> = {}): Promise<string> {
  await call(uid, 'PATCH', '/v1/me', {
    acceptConsent: { privacyVersion: PRIVACY_POLICY_VERSION, termsVersion: TERMS_VERSION },
  });
  const placeId = (await call(uid, 'GET', '/v1/places?q=mumbai')).json<{
    places: { placeId: string }[];
  }>().places[0]?.placeId;
  const res = await call(uid, 'POST', '/v1/profiles', {
    name: 'Asha Rao',
    relation: 'self',
    birthDate: { year: 1990, month: 5, day: 10 },
    timeKnown: true,
    birthTime: { hour: 19, minute: 55 },
    placeId,
    ...overrides,
  });
  expect(res.statusCode, res.body).toBe(201);
  provider.reset(); // count only reading calls from here on
  return res.json<{ id: string }>().id;
}

const providerCalls = () => provider.callCount('getChart') + provider.callCount('getPlanets');

describe('GET /v1/profiles/:id/chart', () => {
  it('returns the D1 chart and planet table in the contract shape', async () => {
    const id = await newProfile('alice');
    const res = await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    expect(res.statusCode).toBe(200);
    const chart = chartResponseSchema.parse(res.json());
    expect(chart.houses).toHaveLength(12);
    expect(chart.planets).toHaveLength(10);
    expect(chart.houses.flatMap((h) => h.bodies).sort()).toEqual([...GRAHAS].sort());
  });

  it('serves repeats from cache: no further provider calls or quota', async () => {
    const id = await newProfile('alice');
    await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    const used = await quota.usedToday('alice');
    expect(providerCalls()).toBe(2); // chart + planets
    await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    await call('alice', 'GET', `/v1/profiles/${id}/planets`);
    expect(providerCalls()).toBe(2);
    expect(await quota.usedToday('alice')).toBe(used);
  });

  it('D9 is cached separately but reuses the planet table', async () => {
    const id = await newProfile('alice');
    await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D9`);
    expect(provider.callCount('getChart')).toBe(2);
    expect(provider.callCount('getPlanets')).toBe(1);
  });

  it('5 concurrent identical requests make one provider call', async () => {
    const id = await newProfile('alice');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`)),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    expect(provider.callCount('getChart')).toBe(1);
  });

  it('unknown birth time: 409 BIRTH_TIME_REQUIRED before any provider call', async () => {
    const id = await newProfile('alice', { timeKnown: false, birthTime: null });
    const res = await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'BIRTH_TIME_REQUIRED' } });
    expect(providerCalls()).toBe(0);
  });

  it('refetches after a birth-data edit (new input hash)', async () => {
    const id = await newProfile('alice');
    await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    await call('alice', 'PATCH', `/v1/profiles/${id}`, {
      birthDate: { year: 1991, month: 5, day: 10 },
    });
    await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    expect(provider.callCount('getChart')).toBe(2);
  });

  it('provider down: 503, nothing cached, quota refunded, next request retries', async () => {
    const id = await newProfile('alice');
    const before = await quota.usedToday('alice');
    provider.failNext('getChart', 'server');
    const res = await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'PROVIDER_UNAVAILABLE' } });
    expect(await quota.usedToday('alice')).toBe(before);
    expect((await db.doc(`users/alice/profiles/${id}/results/chart_D1`).get()).exists).toBe(false);
    expect((await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`)).statusCode).toBe(200);
  });

  it('malformed provider data: 502 PROVIDER_ERROR', async () => {
    const id = await newProfile('alice');
    provider.failNext('getChart', 'malformed');
    const res = await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: { code: 'PROVIDER_ERROR' } });
  });

  it('never serves a result cached from a different provider source', async () => {
    const id = await newProfile('alice');
    await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    await db.doc(`users/alice/profiles/${id}/results/chart_D1`).update({ source: 'astrologyapi' });
    await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    expect(provider.callCount('getChart')).toBe(2);
  });

  it('refetches instead of serving corrupt cached data', async () => {
    const id = await newProfile('alice');
    await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    await db
      .doc(`users/alice/profiles/${id}/results/chart_D1`)
      .update({ data: [{ house: 'nonsense' }] });
    const res = await call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    expect(res.statusCode).toBe(200);
    expect(provider.callCount('getChart')).toBe(2);
  });

  it('does not store a result if the profile changed while fetching', async () => {
    const id = await newProfile('alice');
    provider.hold();
    const pending = call('alice', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    await new Promise((r) => setTimeout(r, 200)); // let the fetch reach the gate
    await call('alice', 'PATCH', `/v1/profiles/${id}`, {
      birthDate: { year: 1991, month: 5, day: 10 },
    });
    provider.release();
    expect((await pending).statusCode).toBe(200);
    expect((await db.doc(`users/alice/profiles/${id}/results/chart_D1`).get()).exists).toBe(false);
  });

  it("another user's profile: 404 and no provider call", async () => {
    const id = await newProfile('alice');
    const res = await call('mallory', 'GET', `/v1/profiles/${id}/chart?type=D1`);
    expect(res.statusCode).toBe(404);
    expect(providerCalls()).toBe(0);
  });

  it.each(['D2', 'd1', ''])('invalid chart type %j: 400', async (type) => {
    const id = await newProfile('alice');
    expect((await call('alice', 'GET', `/v1/profiles/${id}/chart?type=${type}`)).statusCode).toBe(
      400,
    );
  });
});

describe('GET /v1/profiles/:id/planets', () => {
  it('known time: full table including Lagna and houses', async () => {
    const id = await newProfile('alice');
    const body = planetsResponseSchema.parse(
      (await call('alice', 'GET', `/v1/profiles/${id}/planets`)).json(),
    );
    expect(body.timeAssumedNoon).toBe(false);
    expect(body.planets.find((p) => p.body === 'Ascendant')?.house).toBe(1);
  });

  it('unknown time: no Lagna, no degrees, houses or padas; flagged', async () => {
    const id = await newProfile('alice', { timeKnown: false, birthTime: null });
    const body = planetsResponseSchema.parse(
      (await call('alice', 'GET', `/v1/profiles/${id}/planets`)).json(),
    );
    expect(body.timeAssumedNoon).toBe(true);
    expect(body.planets.map((p) => p.body)).not.toContain('Ascendant');
    expect(body.planets).toHaveLength(9);
    for (const p of body.planets) {
      expect([p.degreeInSign, p.fullDegree, p.house, p.nakshatraPada]).toEqual([
        null,
        null,
        null,
        null,
      ]);
      expect(p.sign).toBeTruthy();
      expect(p.nakshatra).toBeTruthy();
    }
  });
});

describe('ProviderCallLog', () => {
  it('records call metadata with the pseudonymous uid from the request context', async () => {
    const log = new ProviderCallLog(db, undefined, () => NOW);
    await runWithContext({ uidHash: uidHash('alice', pepper) }, () => {
      log.record({ endpoint: 'planets', attempt: 1, latencyMs: 42, status: 200, errorKind: null });
      return Promise.resolve();
    });
    await new Promise((r) => setTimeout(r, 300)); // fire-and-forget write
    const docs = (await db.collection('providerCalls').get()).docs.map((d) => d.data());
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      endpoint: 'planets',
      status: 200,
      latencyMs: 42,
      uidHash: uidHash('alice', pepper),
    });
    expect((docs[0]?.['expireAt'] as Timestamp).toMillis()).toBe(NOW.getTime() + 30 * 86_400_000);
    expect(JSON.stringify(docs[0])).not.toContain('alice');
  });
});
