// T9.1 security suite (Firestore emulator). Systematic, so routes added later are covered too:
// - every /v1 route requires authentication (routes are discovered, not listed by hand);
// - another user can never read, change or delete a profile or anything derived from it;
// - path-like ids never address other documents;
// - logs from a full user journey contain no personal data or tokens.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, RouteOptions } from 'fastify';
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
const logLines: string[] = [];
const routes: { method: string; url: string }[] = [];

beforeAll(async () => {
  h = await createHarness(new MockProvider(), { logLines, logLevel: 'info' });
});
afterAll(async () => {
  await h.app.close();
});
beforeEach(async () => {
  h.setNow(new Date('2026-10-17T12:00:00Z'));
  h.provider.reset();
  logLines.length = 0;
  await resetEmulator();
});

/** Every registered route, discovered from Fastify itself. */
function registeredRoutes(app: FastifyInstance): { method: string; url: string }[] {
  if (routes.length > 0) return routes;
  const text = app.printRoutes({ commonPrefix: false, includeHooks: false });
  // printRoutes is a tree; rebuild full paths with methods.
  const stack: string[] = [];
  for (const line of text.split('\n')) {
    const match =
      /^([\s│├└─]*)(\S.*?) \(([A-Z, ]+)\)$/.exec(line) ?? /^([\s│├└─]*)(\S.*)$/.exec(line);
    if (!match) continue;
    const depth = Math.floor((match[1] ?? '').length / 4);
    const segment = (match[2] ?? '').trim();
    stack.length = depth;
    stack.push(segment);
    const methods = match[3];
    if (methods) {
      for (const m of methods.split(',').map((s) => s.trim())) {
        if (m !== 'HEAD' && m !== 'OPTIONS') routes.push({ method: m, url: stack.join('') });
      }
    }
  }
  return routes;
}

describe('every /v1 route requires authentication', () => {
  it('discovers all /v1 routes (sanity: at least the 14 documented ones)', () => {
    const v1 = registeredRoutes(h.app).filter((r) => r.url.startsWith('/v1'));
    expect(v1.length).toBeGreaterThanOrEqual(14);
  });

  it('answers 401 without a token, before doing any work', async () => {
    const v1 = registeredRoutes(h.app).filter((r) => r.url.startsWith('/v1'));
    for (const route of v1) {
      const url = route.url.replace(':id', 'abcdefghijklmnopqrst').replace(':md', 'Sun');
      const res = await h.app.inject({
        method: route.method as RouteOptions['method'] & string,
        url,
        payload: route.method === 'GET' || route.method === 'DELETE' ? undefined : {},
      });
      expect({ route: `${route.method} ${route.url}`, status: res.statusCode }).toEqual({
        route: `${route.method} ${route.url}`,
        status: 401,
      });
    }
    expect(h.provider.callCount()).toBe(0);
  });

  it('rejects a forged token the same way', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/v1/profiles',
      headers: { authorization: 'Bearer forged.token.value' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('cross-user isolation (user B against user A’s profile)', () => {
  it('every per-profile route answers 404 to another user, leaks nothing and changes nothing', async () => {
    const id = await createProfile(h, 'alice');
    const asAlice = caller(h.app, 'alice');
    await asAlice('GET', `/v1/profiles/${id}/chart?type=D1`); // A has cached readings
    h.provider.reset();
    const before = (await db.doc(`users/alice/profiles/${id}`).get()).data();

    const asMallory = caller(h.app, 'mallory');
    const attempts: [string, string, object?][] = [
      ['GET', `/v1/profiles/${id}`],
      ['PATCH', `/v1/profiles/${id}`, { name: 'Pwned' }],
      ['GET', `/v1/profiles/${id}/chart?type=D1`],
      ['GET', `/v1/profiles/${id}/planets`],
      ['GET', `/v1/profiles/${id}/dasha`],
      ['GET', `/v1/profiles/${id}/dasha/Venus`],
      ['GET', `/v1/profiles/${id}/prediction?date=2026-10-17`],
      ['DELETE', `/v1/profiles/${id}`],
    ];
    for (const [method, url, payload] of attempts) {
      const res = await asMallory(method as 'GET', url, payload);
      expect({ url: `${method} ${url}`, status: res.statusCode }).toEqual({
        url: `${method} ${url}`,
        status: 404,
      });
      expect(res.body).not.toContain('Asha');
      expect(res.body).not.toContain('Mumbai');
    }
    expect(h.provider.callCount()).toBe(0);
    expect((await db.doc(`users/alice/profiles/${id}`).get()).data()).toEqual(before);
    expect((await asMallory('GET', '/v1/profiles')).json()).toEqual({ profiles: [] });
  });
});

describe('path injection', () => {
  const evilIds = [
    '..',
    '..%2F..%2Fusers%2Falice',
    'abc%2Fdef',
    '%2E%2E',
    'a'.repeat(21),
    'users',
    '%00',
  ];

  it.each(evilIds)(
    'id %j is a 404 on every per-profile route and touches nothing',
    async (evil) => {
      await createProfile(h, 'alice');
      const asMallory = caller(h.app, 'mallory');
      for (const suffix of [
        '',
        '/chart?type=D1',
        '/planets',
        '/dasha',
        '/dasha/Sun',
        '/prediction?date=2026-10-17',
      ]) {
        const res = await asMallory('GET', `/v1/profiles/${evil}${suffix}`);
        expect([400, 404]).toContain(res.statusCode);
      }
      expect(h.provider.callCount()).toBe(0);
    },
  );

  it.each(['..', 'sun', 'Pluto', 'Sun%2F..'])('mahadasha %j is rejected', async (md) => {
    const id = await createProfile(h, 'alice');
    const res = await caller(h.app, 'alice')('GET', `/v1/profiles/${id}/dasha/${md}`);
    // ".." is normalised away before routing (404); other values fail validation (400).
    expect([400, 404]).toContain(res.statusCode);
    expect(h.provider.callCount()).toBe(0);
  });
});

describe('logs from a full user journey contain no personal data', () => {
  it('no name, birth date/time, coordinates, place query, email or token in any log line', async () => {
    const id = await createProfile(h, 'alice', { name: 'Zorawar Singh' });
    const call = caller(h.app, 'alice');
    await call('GET', '/v1/places?q=Varanasi');
    await call('GET', `/v1/profiles/${id}/chart?type=D1`);
    await call('GET', `/v1/profiles/${id}/dasha`);
    await call('GET', `/v1/profiles/${id}/prediction?date=2026-10-17`);
    await call('PATCH', `/v1/profiles/${id}`, { name: 'Zorawar S' });
    const all = logLines.join('\n');
    expect(logLines.length).toBeGreaterThan(5); // logging really was on
    for (const secret of [
      'Zorawar',
      'Varanasi',
      '1990',
      '19:55',
      '19.07',
      '72.88',
      'uid.alice',
      'Bearer',
    ]) {
      expect(all, `log contains ${secret}`).not.toContain(secret);
    }
  });
});
