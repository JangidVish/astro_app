// Integration: per-user daily quota against the Firestore emulator (run via `npm test`).
import { randomBytes } from 'node:crypto';
import type { Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '../../src/common/errors.js';
import { firestore } from '../../src/common/firebase.js';
import { QuotaService, secondsUntilUtcMidnight } from '../../src/modules/quota/service.js';

const PROJECT_ID = 'demo-astro-app';
const EMULATOR = process.env['FIRESTORE_EMULATOR_HOST'];
const db = firestore(PROJECT_ID);
const pepper = randomBytes(32);

let clock = new Date('2026-10-17T12:00:00Z');
const quota = (limitPerDay: number) =>
  new QuotaService({ db, pepper, limitPerDay, now: () => clock });

beforeEach(async () => {
  if (!EMULATOR) throw new Error('FIRESTORE_EMULATOR_HOST is not set; run via npm test');
  clock = new Date('2026-10-17T12:00:00Z');
  const res = await fetch(
    `http://${EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  expect(res.ok).toBe(true);
});

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('expected an AppError');
}

const auditCount = async () =>
  (await db.collection('auditEvents').where('type', '==', 'quota_exceeded').get()).size;

describe('QuotaService', () => {
  it('allows calls up to the limit, then 429 with Retry-After until UTC midnight', async () => {
    const q = quota(3);
    for (let i = 0; i < 3; i++) await q.reserve('alice');
    const error = await rejection(q.reserve('alice'));
    expect([error.code, error.status, error.retryable]).toEqual(['QUOTA_EXCEEDED', 429, true]);
    expect(error.options.headers).toEqual({ 'retry-after': String(12 * 3600) });
    expect(await q.usedToday('alice')).toBe(3);
  });

  // Contended transactions on one document are slow in the emulator (measured 4-8 s for 20);
  // correctness is what is asserted, so allow more time than the 5 s default.
  it(
    'is exact under 20 concurrent reservations against a limit of 10',
    { timeout: 30_000 },
    async () => {
      const q = quota(10);
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, () => q.reserve('racer')),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(10);
      expect(await q.usedToday('racer')).toBe(10);
    },
  );

  it('keeps users separate', async () => {
    const q = quota(1);
    await q.reserve('alice');
    await expect(q.reserve('bob')).resolves.toBeDefined();
  });

  it('resets at UTC midnight', async () => {
    const q = quota(1);
    clock = new Date('2026-10-17T23:59:59Z');
    await q.reserve('alice');
    expect((await rejection(q.reserve('alice'))).options.headers?.['retry-after']).toBe('1');
    clock = new Date('2026-10-18T00:00:00Z');
    await expect(q.reserve('alice')).resolves.toEqual({ day: '2026-10-18' });
  });

  it('audits only the first breach of the day, with a pseudonymous id', async () => {
    const q = quota(1);
    await q.reserve('alice');
    for (let i = 0; i < 5; i++) await rejection(q.reserve('alice'));
    expect(await auditCount()).toBe(1);
    const [event] = (await db.collection('auditEvents').get()).docs.map((d) => d.data());
    expect(JSON.stringify(event)).not.toContain('alice');
  });

  it('sets a 7-day expiry on usage documents for the TTL policy', async () => {
    await quota(5).reserve('alice');
    const usage = (await db.doc('users/alice/usage/2026-10-17').get()).data();
    expect((usage?.['expireAt'] as Timestamp).toDate().toISOString()).toBe(
      '2026-10-24T00:00:00.000Z',
    );
  });
});

describe('QuotaService.runMetered', () => {
  it('counts a successful provider call', async () => {
    const q = quota(5);
    await expect(q.runMetered('alice', () => Promise.resolve('chart'))).resolves.toBe('chart');
    expect(await q.usedToday('alice')).toBe(1);
  });

  it('refunds when the provider call fails, and rethrows the original error', async () => {
    const q = quota(5);
    const failure = new Error('provider down');
    await expect(q.runMetered('alice', () => Promise.reject(failure))).rejects.toBe(failure);
    expect(await q.usedToday('alice')).toBe(0);
  });

  it('does not run the call at all when over quota', async () => {
    const q = quota(1);
    await q.reserve('alice');
    let ran = false;
    await rejection(
      q.runMetered('alice', () => {
        ran = true;
        return Promise.resolve();
      }),
    );
    expect(ran).toBe(false);
  });
});

describe('secondsUntilUtcMidnight', () => {
  it.each([
    ['2026-10-17T00:00:00Z', 86_400],
    ['2026-10-17T23:59:59.500Z', 1],
    ['2026-12-31T23:00:00Z', 3_600],
  ])('%s -> %i', (at, seconds) => {
    expect(secondsUntilUtcMidnight(new Date(at))).toBe(seconds);
  });
});
