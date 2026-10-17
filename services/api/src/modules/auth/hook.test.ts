import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { loadConfig } from '../../common/config.js';
import { requireAuth } from './hook.js';
import {
  TokenRejectedError,
  VerifierUnavailableError,
  type TokenVerifier,
  type VerifiedIdentity,
} from './verifier.js';

const GOOD_TOKEN = 'good.id.token';
const GOOD_APP_CHECK = 'good-app-check';

/** Fake verifier: behaviour is chosen by the token string. Records calls. */
function fakeVerifier(calls: string[] = []): TokenVerifier {
  return {
    verifyIdToken(token): Promise<VerifiedIdentity> {
      calls.push(`id:${token}`);
      if (token === GOOD_TOKEN) return Promise.resolve({ uid: 'uid-from-token', authTime: 1_000 });
      if (token === 'expired.id.token')
        return Promise.reject(new TokenRejectedError('id_token_expired'));
      if (token === 'revoked.id.token')
        return Promise.reject(new TokenRejectedError('id_token_revoked'));
      if (token === 'outage.id.token') return Promise.reject(new VerifierUnavailableError());
      return Promise.reject(new TokenRejectedError('id_token_invalid'));
    },
    verifyAppCheckToken(token): Promise<void> {
      calls.push(`appcheck:${token}`);
      return token === GOOD_APP_CHECK
        ? Promise.resolve()
        : Promise.reject(new TokenRejectedError('app_check_invalid'));
    },
  };
}

function makeConfig(appCheckEnforced: boolean) {
  return loadConfig({
    APP_ENV: 'test',
    ASTRO_PROVIDER: 'mock',
    UID_HASH_PEPPER: randomBytes(32).toString('base64'),
    FIREBASE_PROJECT_ID: 'demo-astro-app',
    APP_CHECK_ENFORCED: String(appCheckEnforced),
  });
}

let app: FastifyInstance | undefined;
let logLines: string[] = [];

async function start(options: { appCheckEnforced?: boolean; calls?: string[] } = {}) {
  logLines = [];
  app = buildApp(makeConfig(options.appCheckEnforced ?? false), {
    deps: { verifier: fakeVerifier(options.calls) },
    logStream: { write: (line) => logLines.push(line) },
    modules: [
      (v1) => {
        // Echoes the identity; also receives attacker-controlled uid hints that must be ignored.
        v1.post('/whoami', (request) => ({ uid: requireAuth(request).uid }));
        v1.get('/whoami', (request) => ({ uid: requireAuth(request).uid }));
      },
    ],
  });
  await app.ready();
  return app;
}

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe('auth hook: ID token', () => {
  it('accepts a valid token and exposes the uid from the token', async () => {
    const server = await start();
    const res = await server.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: bearer(GOOD_TOKEN),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ uid: 'uid-from-token' });
  });

  it('ignores uid hints in headers, query and body', async () => {
    const server = await start();
    const res = await server.inject({
      method: 'POST',
      url: '/v1/whoami?uid=attacker',
      headers: { ...bearer(GOOD_TOKEN), 'x-uid': 'attacker', 'content-type': 'application/json' },
      payload: { uid: 'attacker' },
    });
    expect(res.json()).toEqual({ uid: 'uid-from-token' });
  });

  it.each([
    ['no Authorization header', {}, 'missing_authorization'],
    ['Basic scheme', { authorization: 'Basic dXNlcjpwYXNz' }, 'bad_scheme'],
    ['lowercase bearer', { authorization: `bearer ${GOOD_TOKEN}` }, 'bad_scheme'],
    ['empty bearer', { authorization: 'Bearer ' }, 'bad_scheme'],
    ['token with spaces', { authorization: 'Bearer a b' }, 'bad_scheme'],
    ['expired token', bearer('expired.id.token'), 'id_token_expired'],
    ['revoked token', bearer('revoked.id.token'), 'id_token_revoked'],
    ['garbage token', bearer('garbage'), 'id_token_invalid'],
  ])('rejects %s with a generic 401 and logs the reason', async (_label, headers, reason) => {
    const server = await start();
    const res = await server.inject({ method: 'GET', url: '/v1/whoami', headers });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Authentication required', retryable: false },
    });
    const logs = logLines.join('\n');
    expect(logs).toContain(`"authFailure":"${reason}"`);
  });

  it('returns 503 (not 401) when verification itself is unavailable', async () => {
    const server = await start();
    const res = await server.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: bearer('outage.id.token'),
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE', retryable: true } });
  });

  it('never writes tokens to the logs', async () => {
    const server = await start({ appCheckEnforced: true });
    await server.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: { ...bearer('expired.id.token'), 'x-firebase-appcheck': GOOD_APP_CHECK },
    });
    const logs = logLines.join('\n');
    expect(logs).not.toContain('expired.id.token');
    expect(logs).not.toContain(GOOD_APP_CHECK);
  });

  it('leaves /healthz public', async () => {
    const server = await start({ appCheckEnforced: true });
    expect((await server.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
  });
});

describe('auth hook: App Check', () => {
  it('when enforced: requires a valid App Check token before checking the ID token', async () => {
    const calls: string[] = [];
    const server = await start({ appCheckEnforced: true, calls });

    const missing = await server.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: bearer(GOOD_TOKEN),
    });
    expect(missing.statusCode).toBe(401);
    expect(logLines.join('\n')).toContain('"authFailure":"app_check_missing"');

    const invalid = await server.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: { ...bearer(GOOD_TOKEN), 'x-firebase-appcheck': 'forged' },
    });
    expect(invalid.statusCode).toBe(401);
    expect(logLines.join('\n')).toContain('"authFailure":"app_check_invalid"');

    const ok = await server.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: { ...bearer(GOOD_TOKEN), 'x-firebase-appcheck': GOOD_APP_CHECK },
    });
    expect(ok.statusCode).toBe(200);

    // A bad App Check token stops the request before the ID token is even verified.
    expect(calls).toEqual(['appcheck:forged', `appcheck:${GOOD_APP_CHECK}`, `id:${GOOD_TOKEN}`]);
  });

  it('when not enforced: App Check is not consulted', async () => {
    const calls: string[] = [];
    const server = await start({ appCheckEnforced: false, calls });
    const res = await server.inject({
      method: 'GET',
      url: '/v1/whoami',
      headers: bearer(GOOD_TOKEN),
    });
    expect(res.statusCode).toBe(200);
    expect(calls).toEqual([`id:${GOOD_TOKEN}`]);
  });
});

describe('config guard', () => {
  it.each(['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST'])(
    'refuses %s in prod (emulators accept unsigned tokens)',
    (name) => {
      expect(() =>
        loadConfig({
          APP_ENV: 'prod',
          ASTRO_PROVIDER: 'astrologyapi',
          ASTROLOGYAPI_USER_ID: 'u',
          ASTROLOGYAPI_API_KEY: 'k',
          UID_HASH_PEPPER: randomBytes(32).toString('base64'),
          FIREBASE_PROJECT_ID: 'astro-app-prod',
          APP_CHECK_ENFORCED: 'true',
          [name]: '127.0.0.1:9099',
        }),
      ).toThrow(name);
    },
  );
});
