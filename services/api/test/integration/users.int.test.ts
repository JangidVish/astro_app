// Integration: /v1/me against the Firestore emulator (run via `npm test`).
import { randomBytes } from 'node:crypto';
import { Timestamp } from 'firebase-admin/firestore';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@astro/shared';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/common/config.js';
import { firestore } from '../../src/common/firebase.js';
import { uidHash } from '../../src/common/hashing.js';
import { TokenRejectedError, type TokenVerifier } from '../../src/modules/auth/verifier.js';
import { createUsersService, usersModule } from '../../src/modules/users/routes.js';

const PROJECT_ID = 'demo-astro-app';
const EMULATOR = process.env['FIRESTORE_EMULATOR_HOST'];
const pepper = randomBytes(32);
const db = firestore(PROJECT_ID);
const NOW = new Date('2026-10-17T12:00:00Z');

/** Fake verifier: token "uid.<id>" authenticates as <id> (token charset: base64url and dots). */
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

let app: FastifyInstance;

beforeAll(async () => {
  if (!EMULATOR) throw new Error('FIRESTORE_EMULATOR_HOST is not set; run via npm test');
  app = buildApp(config, {
    deps: { verifier },
    modules: [usersModule({ db, pepper, now: () => NOW })],
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  const res = await fetch(
    `http://${String(EMULATOR)}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  expect(res.ok).toBe(true);
});

const as = (uid: string) => ({ authorization: `Bearer uid.${uid}` });

async function auditEvents(type: string) {
  const snapshot = await db.collection('auditEvents').where('type', '==', type).get();
  return snapshot.docs.map((d) => d.data());
}

describe('GET /v1/me', () => {
  it('creates the user on first use with consent required', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: as('alice') });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      displayName: null,
      consent: null,
      consentRequired: true,
      primaryProfileId: null,
      profileCount: 0,
    });
    const stored = (await db.doc('users/alice').get()).data();
    expect(stored).toMatchObject({ status: 'active', schemaVersion: 1, profileCount: 0 });
    expect(Object.keys(stored ?? {})).not.toContain('email');
  });

  it('writes one pseudonymous account_created audit event, not one per request', async () => {
    await app.inject({ method: 'GET', url: '/v1/me', headers: as('alice') });
    await app.inject({ method: 'GET', url: '/v1/me', headers: as('alice') });
    const events = await auditEvents('account_created');
    expect(events).toHaveLength(1);
    expect(events[0]?.['uidHash']).toBe(uidHash('alice', pepper));
    expect(JSON.stringify(events)).not.toContain('alice');
    expect((events[0]?.['expireAt'] as Timestamp).toMillis()).toBe(
      NOW.getTime() + 180 * 86_400_000,
    );
  });

  it('creates exactly one user under 20 concurrent first requests', async () => {
    const responses = await Promise.all(
      Array.from({ length: 20 }, () =>
        app.inject({ method: 'GET', url: '/v1/me', headers: as('racer') }),
      ),
    );
    expect(responses.every((r) => r.statusCode === 200)).toBe(true);
    expect(await auditEvents('account_created')).toHaveLength(1);
  });

  it('requires authentication', async () => {
    expect((await app.inject({ method: 'GET', url: '/v1/me' })).statusCode).toBe(401);
  });

  it('treats a user being deleted as signed out', async () => {
    await app.inject({ method: 'GET', url: '/v1/me', headers: as('leaving') });
    await db.doc('users/leaving').update({ status: 'deleting' });
    expect(
      (await app.inject({ method: 'GET', url: '/v1/me', headers: as('leaving') })).statusCode,
    ).toBe(401);
  });

  it('a corrupt stored document fails with a generic 500, never partial data', async () => {
    await db.doc('users/broken').set({ displayName: 42, schemaVersion: 1 });
    const res = await app.inject({ method: 'GET', url: '/v1/me', headers: as('broken') });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ error: { code: 'INTERNAL' } });
  });
});

describe('PATCH /v1/me', () => {
  const patch = (uid: string, payload: unknown) =>
    app.inject({ method: 'PATCH', url: '/v1/me', headers: as(uid), payload: payload as object });

  it('sets, normalizes and clears the display name', async () => {
    expect((await patch('alice', { displayName: '  आशा   राव ' })).json()).toMatchObject({
      displayName: 'आशा राव',
    });
    expect((await patch('alice', { displayName: null })).json()).toMatchObject({
      displayName: null,
    });
  });

  it.each([
    ['invalid name', { displayName: 'Agent 007' }, 'INVALID_NAME'],
    ['empty update', {}, 'EMPTY_UPDATE'],
    ['injected field', { displayName: 'A', uid: 'mallory' }, 'UNKNOWN_FIELD'],
    ['profileCount tampering', { profileCount: 99 }, 'UNKNOWN_FIELD'],
  ])('rejects %s with 400 %s', async (_label, payload, code) => {
    const res = await patch('alice', payload);
    expect(res.statusCode).toBe(400);
    const body = res.json<{ error: { code: string; details: { code: string }[] } }>();
    expect(body.error.code).toBe('VALIDATION_FAILED');
    expect(body.error.details.map((d) => d.code)).toContain(code);
  });

  it('accepts the current policies and records when', async () => {
    const res = await patch('alice', {
      acceptConsent: { privacyVersion: PRIVACY_POLICY_VERSION, termsVersion: TERMS_VERSION },
    });
    expect(res.json()).toMatchObject({
      consentRequired: false,
      consent: {
        privacyVersion: PRIVACY_POLICY_VERSION,
        termsVersion: TERMS_VERSION,
        acceptedAt: '2026-10-17T12:00:00Z',
      },
    });
  });

  it('refuses consent to an outdated policy version and stores nothing', async () => {
    const res = await patch('alice', {
      acceptConsent: { privacyVersion: '2020-01-01', termsVersion: TERMS_VERSION },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'POLICY_VERSION_OUTDATED' } });
    expect((await db.doc('users/alice').get()).data()?.['consent']).toBeNull();
  });

  it('asks again for consent after a policy update', async () => {
    await app.inject({ method: 'GET', url: '/v1/me', headers: as('alice') });
    await db.doc('users/alice').update({
      consent: {
        privacyVersion: '2025-01-01',
        termsVersion: TERMS_VERSION,
        acceptedAt: Timestamp.fromDate(NOW),
      },
    });
    expect(
      (await app.inject({ method: 'GET', url: '/v1/me', headers: as('alice') })).json(),
    ).toMatchObject({
      consentRequired: true,
    });
  });

  it("only changes the caller's own document", async () => {
    await app.inject({ method: 'GET', url: '/v1/me', headers: as('bob') });
    await patch('alice', { displayName: 'Alice' });
    expect(
      (await app.inject({ method: 'GET', url: '/v1/me', headers: as('bob') })).json(),
    ).toMatchObject({
      displayName: null,
    });
  });
});

describe('UsersService.requireConsent', () => {
  it('blocks until the current policies are accepted', async () => {
    const service = createUsersService({ db, pepper, now: () => NOW });
    await expect(service.requireConsent('carol')).rejects.toMatchObject({
      code: 'CONSENT_REQUIRED',
      status: 403,
    });
    await service.updateMe('carol', {
      acceptConsent: { privacyVersion: PRIVACY_POLICY_VERSION, termsVersion: TERMS_VERSION },
    });
    await expect(service.requireConsent('carol')).resolves.toBeUndefined();
  });
});
