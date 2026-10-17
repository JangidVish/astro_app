// Integration: dasha and daily prediction endpoints (Firestore emulator), via the shared harness.
import type { Timestamp } from 'firebase-admin/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  GRAHAS,
  antardashaResponseSchema,
  mahadashaResponseSchema,
  predictionResponseSchema,
} from '@astro/shared';
import { MockProvider } from '../../src/modules/astrology-provider/mock/mock-provider.js';
import {
  caller,
  createHarness,
  createProfile,
  db,
  resetEmulator,
  type Harness,
} from './harness.js';

let h: Harness;
beforeAll(async () => {
  h = await createHarness(new MockProvider());
});
afterAll(async () => {
  await h.app.close();
});
beforeEach(async () => {
  h.setNow(new Date('2026-10-17T12:00:00Z'));
  h.provider.reset();
  await resetEmulator();
});

describe('GET /v1/profiles/:id/dasha', () => {
  it('returns 9 Mahadashas and the current Maha/Antar period', async () => {
    const id = await createProfile(h, 'alice');
    const res = await caller(h.app, 'alice')('GET', `/v1/profiles/${id}/dasha`);
    expect(res.statusCode).toBe(200);
    const body = mahadashaResponseSchema.parse(res.json());
    expect(body.mahadashas).toHaveLength(9);
    // "current" must be the period that contains the (injected) now.
    const at = Date.parse('2026-10-17T12:00:00Z');
    const md = body.mahadashas.find((p) => Date.parse(p.start) <= at && at < Date.parse(p.end));
    expect(body.current?.mahadasha).toBe(md?.lord);
    expect(GRAHAS).toContain(body.current?.antardasha);
  });

  it('is cached: the second request makes no provider calls', async () => {
    const id = await createProfile(h, 'alice');
    const call = caller(h.app, 'alice');
    await call('GET', `/v1/profiles/${id}/dasha`);
    const calls = h.provider.callCount();
    expect(calls).toBe(2); // major + antardashas of the current Mahadasha
    await call('GET', `/v1/profiles/${id}/dasha`);
    expect(h.provider.callCount()).toBe(calls);
  });

  it('antardashas for a chosen Mahadasha start with its lord; cached per lord', async () => {
    const id = await createProfile(h, 'alice');
    const call = caller(h.app, 'alice');
    const res = await call('GET', `/v1/profiles/${id}/dasha/Venus`);
    const body = antardashaResponseSchema.parse(res.json());
    expect(body.mahadasha).toBe('Venus');
    expect(body.antardashas[0]?.lord).toBe('Venus');
    await call('GET', `/v1/profiles/${id}/dasha/Venus`);
    expect(h.provider.callCount('getSubDasha')).toBe(1);
  });

  it.each(['Pluto', 'venus', 'Ascendant'])('rejects Mahadasha %j with 400', async (md) => {
    const id = await createProfile(h, 'alice');
    expect((await caller(h.app, 'alice')('GET', `/v1/profiles/${id}/dasha/${md}`)).statusCode).toBe(
      400,
    );
    expect(h.provider.callCount()).toBe(0);
  });

  it('unknown birth time: 409 BIRTH_TIME_REQUIRED for both endpoints, no provider call', async () => {
    const id = await createProfile(h, 'alice', { timeKnown: false, birthTime: null });
    const call = caller(h.app, 'alice');
    for (const url of [`/v1/profiles/${id}/dasha`, `/v1/profiles/${id}/dasha/Sun`]) {
      const res = await call('GET', url);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toMatchObject({ error: { code: 'BIRTH_TIME_REQUIRED' } });
    }
    expect(h.provider.callCount()).toBe(0);
  });

  it("another user's profile: 404", async () => {
    const id = await createProfile(h, 'alice');
    expect((await caller(h.app, 'mallory')('GET', `/v1/profiles/${id}/dasha`)).statusCode).toBe(
      404,
    );
  });

  it('provider down: 503 and nothing cached', async () => {
    const id = await createProfile(h, 'alice');
    h.provider.failNext('getMajorDasha', 'timeout');
    expect((await caller(h.app, 'alice')('GET', `/v1/profiles/${id}/dasha`)).statusCode).toBe(503);
    expect((await db.doc(`users/alice/profiles/${id}/results/dasha_major`).get()).exists).toBe(
      false,
    );
  });
});

describe('GET /v1/profiles/:id/prediction', () => {
  // now = 2026-10-17 12:00 UTC = 17:30 IST: the Mumbai profile's "today" is 2026-10-17.
  it.each([
    ['2026-10-16', 'previous'],
    ['2026-10-17', 'today'],
    ['2026-10-18', 'next'],
  ])("%s maps to the provider's %s and returns that date", async (date, day) => {
    const id = await createProfile(h, 'alice');
    const res = await caller(h.app, 'alice')('GET', `/v1/profiles/${id}/prediction?date=${date}`);
    expect(res.statusCode, res.body).toBe(200);
    const body = predictionResponseSchema.parse(res.json());
    expect(body).toMatchObject({ date, moonSign: 'Aries', timeAssumedNoon: false });
    expect(h.provider.calls.at(-1)?.args[1]).toBe(day);
  });

  it("uses the birth place's date, not UTC: a +14 h profile is already a day ahead", async () => {
    // 2026-10-17 12:00 UTC is 2026-10-18 02:00 in Kiritimati (UTC+14); its "today" is the 18th.
    const id = await createProfile(h, 'alice');
    await db.doc(`users/alice/profiles/${id}`).update({ utcOffsetMinutes: 840 });
    // The edit above bypassed the API, so the hash is unchanged; that is fine for this check.
    const res = await caller(h.app, 'alice')(
      'GET',
      `/v1/profiles/${id}/prediction?date=2026-10-18`,
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(h.provider.calls.at(-1)?.args[1]).toBe('today');
  });

  it.each(['2026-10-15', '2026-10-19'])(
    '%s is out of range for this profile: 400',
    async (date) => {
      const id = await createProfile(h, 'alice');
      const res = await caller(h.app, 'alice')('GET', `/v1/profiles/${id}/prediction?date=${date}`);
      expect(res.statusCode).toBe(400);
      expect(JSON.stringify(res.json())).toContain('PREDICTION_DATE_OUT_OF_RANGE');
      expect(h.provider.callCount()).toBe(0);
    },
  );

  it.each(['17-10-2026', '2026-02-30', ''])('malformed date %j: 400', async (date) => {
    const id = await createProfile(h, 'alice');
    expect(
      (await caller(h.app, 'alice')('GET', `/v1/profiles/${id}/prediction?date=${date}`))
        .statusCode,
    ).toBe(400);
  });

  it('is cached per date with a 90-day expiry', async () => {
    const id = await createProfile(h, 'alice');
    const call = caller(h.app, 'alice');
    await call('GET', `/v1/profiles/${id}/prediction?date=2026-10-17`);
    await call('GET', `/v1/profiles/${id}/prediction?date=2026-10-17`);
    expect(h.provider.callCount('getDailyPrediction')).toBe(1);
    const stored = await db.doc(`users/alice/profiles/${id}/predictions/2026-10-17`).get();
    const expireAt = stored.get('expireAt') as Timestamp;
    expect(expireAt.toDate().toISOString()).toBe('2027-01-15T00:00:00.000Z');
  });

  it('unknown birth time works, flagged (noon assumed)', async () => {
    const id = await createProfile(h, 'alice', { timeKnown: false, birthTime: null });
    const res = await caller(h.app, 'alice')(
      'GET',
      `/v1/profiles/${id}/prediction?date=2026-10-17`,
    );
    expect(res.json()).toMatchObject({ timeAssumedNoon: true });
  });

  it('a provider date mismatch is never stored under the requested date', async () => {
    const id = await createProfile(h, 'alice');
    // Provider clock one day ahead of ours, as can happen around midnight.
    const original = h.provider.clock;
    h.provider.clock = () => new Date('2026-10-18T12:00:00Z');
    const res = await caller(h.app, 'alice')(
      'GET',
      `/v1/profiles/${id}/prediction?date=2026-10-17`,
    );
    h.provider.clock = original;
    expect(res.statusCode).toBe(502);
    expect((await db.doc(`users/alice/profiles/${id}/predictions/2026-10-17`).get()).exists).toBe(
      false,
    );
  });
});
