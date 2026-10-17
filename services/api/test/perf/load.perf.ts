// T9.2 load test: 50 concurrent users over real HTTP (loopback) against the full app on the
// Firestore emulator, with the mock provider. Measures NFR-6:
// - cached chart or reading p95 < 500 ms;
// - fresh (cache-miss) reading p95 < 4 s. The mock answers instantly, so a fixed simulated
//   provider latency is added to keep misses realistic and to show misses do not serialise.
// Emulator latency differs from production Firestore; results are an indication, not a guarantee.
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockProvider } from '../../src/modules/astrology-provider/mock/mock-provider.js';
import {
  createHarness,
  createProfile,
  resetEmulator,
  type Harness,
} from '../integration/harness.js';

const USERS = 50;
const PROFILES_PER_USER = 2;
const HIT_ROUNDS = 10;
const PROVIDER_LATENCY_MS = 1000;

/** Mock provider with a fixed delay on every reading call, like a remote API. */
class SlowMockProvider extends MockProvider {
  delayMs = 0;
  private delay<T>(promise: Promise<T>): Promise<T> {
    const ms = this.delayMs;
    if (ms === 0) return promise;
    return new Promise<void>((resolve) => setTimeout(resolve, ms)).then(() => promise);
  }
  override getPlanets(...args: Parameters<MockProvider['getPlanets']>) {
    return this.delay(super.getPlanets(...args));
  }
  override getChart(...args: Parameters<MockProvider['getChart']>) {
    return this.delay(super.getChart(...args));
  }
  override getMajorDasha(...args: Parameters<MockProvider['getMajorDasha']>) {
    return this.delay(super.getMajorDasha(...args));
  }
  override getDailyPrediction(...args: Parameters<MockProvider['getDailyPrediction']>) {
    return this.delay(super.getDailyPrediction(...args));
  }
}

let h: Harness;
let base: string;
const provider = new SlowMockProvider();
const users: { uid: string; profileIds: string[] }[] = [];

beforeAll(async () => {
  h = await createHarness(provider);
  h.setNow(new Date('2026-10-17T12:00:00Z'));
  await resetEmulator();
  for (let u = 0; u < USERS; u++) {
    const uid = `perf${String(u)}`;
    const profileIds: string[] = [];
    for (let p = 0; p < PROFILES_PER_USER; p++) profileIds.push(await createProfile(h, uid));
    users.push({ uid, profileIds });
  }
  await h.app.listen({ host: '127.0.0.1', port: 0 });
  base = `http://127.0.0.1:${String((h.app.server.address() as AddressInfo).port)}`;
});
afterAll(async () => {
  await h.app.close();
});

function readingPaths(id: string): string[] {
  return [
    `/v1/profiles/${id}/chart?type=D1`,
    `/v1/profiles/${id}/chart?type=D9`,
    `/v1/profiles/${id}/dasha`,
    `/v1/profiles/${id}/prediction?date=2026-10-17`,
  ];
}

interface Stats {
  count: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  rps: number;
}

/** Runs one worker per user concurrently; each worker issues its requests in order. */
async function load(perUser: (uid: string, ids: string[]) => string[]): Promise<Stats> {
  const latencies: number[] = [];
  let errors = 0;
  const started = performance.now();
  await Promise.all(
    users.map(async ({ uid, profileIds }) => {
      for (const path of perUser(uid, profileIds)) {
        const t0 = performance.now();
        const res = await fetch(base + path, { headers: { authorization: `Bearer uid.${uid}` } });
        await res.arrayBuffer();
        latencies.push(performance.now() - t0);
        if (res.status !== 200) errors++;
      }
    }),
  );
  const seconds = (performance.now() - started) / 1000;
  latencies.sort((a, b) => a - b);
  const at = (q: number) =>
    Math.round(latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] ?? 0);
  return {
    count: latencies.length,
    errors,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: Math.round(latencies.at(-1) ?? 0),
    rps: Math.round(latencies.length / seconds),
  };
}

describe(`NFR-6 under ${String(USERS)} concurrent users`, () => {
  it('cache-miss readings: p95 < 4 s with a 1 s provider', async () => {
    provider.reset();
    provider.delayMs = PROVIDER_LATENCY_MS;
    const stats = await load((_uid, ids) => ids.flatMap(readingPaths));
    process.stdout.write(`cache-miss ${JSON.stringify(stats)}\n`);
    expect(stats.errors).toBe(0);
    expect(provider.callCount()).toBeGreaterThanOrEqual(USERS * PROFILES_PER_USER * 4);
    expect(stats.p95).toBeLessThan(4000);
  });

  it('cache-hit readings: p95 < 500 ms and no provider calls', async () => {
    provider.reset();
    const stats = await load((_uid, ids) =>
      Array.from({ length: HIT_ROUNDS }, () => ids.flatMap(readingPaths)).flat(),
    );
    process.stdout.write(`cache-hit ${JSON.stringify(stats)}\n`);
    expect(stats.errors).toBe(0);
    expect(provider.callCount()).toBe(0);
    expect(stats.p95).toBeLessThan(500);
  });

  it('profile list (no provider involved): p95 < 500 ms', async () => {
    const stats = await load(() => Array.from({ length: HIT_ROUNDS }, () => '/v1/profiles'));
    process.stdout.write(`profiles ${JSON.stringify(stats)}\n`);
    expect(stats.errors).toBe(0);
    expect(stats.p95).toBeLessThan(500);
  });
});
