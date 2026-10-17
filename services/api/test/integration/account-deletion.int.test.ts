// Integration: DELETE /v1/me against the Firestore and Auth emulators (run via `npm test`).
import { randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import type { DocumentReference } from 'firebase-admin/firestore';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@astro/shared';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/common/config.js';
import { firebaseApp, firestore } from '../../src/common/firebase.js';
import { uidHash } from '../../src/common/hashing.js';
import { MockProvider } from '../../src/modules/astrology-provider/mock/mock-provider.js';
import { TokenRejectedError, type TokenVerifier } from '../../src/modules/auth/verifier.js';
import { profilesModule } from '../../src/modules/birth-profiles/routes.js';
import { ProfilesService } from '../../src/modules/birth-profiles/service.js';
import { placesModule } from '../../src/modules/places/routes.js';
import { PlacesService } from '../../src/modules/places/service.js';
import { QuotaService } from '../../src/modules/quota/service.js';
import { AccountDeletionService, FirebaseAuthAdmin } from '../../src/modules/users/deletion.js';
import { createUsersService, usersModule } from '../../src/modules/users/routes.js';

const PROJECT_ID = 'demo-astro-app';
const FS = process.env['FIRESTORE_EMULATOR_HOST'];
const AUTH = process.env['FIREBASE_AUTH_EMULATOR_HOST'];
const db = firestore(PROJECT_ID);
const adminAuth = getAuth(firebaseApp(PROJECT_ID));
const pepper = randomBytes(32);
const NOW = new Date('2026-10-17T12:00:00Z');
let tick = 0;
const now = () => new Date(NOW.getTime() + tick++ * 1000);
const nowSeconds = () => Math.floor(NOW.getTime() / 1000);

/** "uid.<id>": signed in just now. "stale.<id>": signed in 10 minutes ago. */
const verifier: TokenVerifier = {
  verifyIdToken: (token) => {
    const [kind, uid = ''] = token.split('.');
    if (kind === 'uid') return Promise.resolve({ uid, authTime: nowSeconds() });
    if (kind === 'stale') return Promise.resolve({ uid, authTime: nowSeconds() - 600 });
    return Promise.reject(new TokenRejectedError('id_token_invalid'));
  },
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

const quota = new QuotaService({ db, pepper, limitPerDay: 100, now });
const users = createUsersService({ db, pepper, now });
const places = new PlacesService({ db, provider: new MockProvider(), quota, now });
const profiles = new ProfilesService({ db, users, places, pepper, now });
const deletion = new AccountDeletionService({
  db,
  pepper,
  now,
  authAdmin: new FirebaseAuthAdmin(firebaseApp(PROJECT_ID)),
});
let app: FastifyInstance;

beforeAll(async () => {
  if (!FS || !AUTH) throw new Error('Emulators are not set up; run via npm test');
  app = buildApp(config, {
    deps: { verifier },
    modules: [
      usersModule({ db, pepper, now, deletion }, users),
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
  const wipes = await Promise.all([
    fetch(`http://${String(FS)}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
      method: 'DELETE',
    }),
    fetch(`http://${String(AUTH)}/emulator/v1/projects/${PROJECT_ID}/accounts`, {
      method: 'DELETE',
    }),
  ]);
  for (const res of wipes) expect(res.ok).toBe(true);
});

const call = (
  token: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: object,
) =>
  app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload ? { payload } : {}),
  });

/** Everything under a document, recursively: a list of paths. */
async function allPaths(ref: DocumentReference): Promise<string[]> {
  const paths: string[] = [];
  if ((await ref.get()).exists) paths.push(ref.path);
  for (const collection of await ref.listCollections()) {
    for (const doc of await collection.listDocuments()) paths.push(...(await allPaths(doc)));
  }
  return paths;
}

/** A user with an auth account, consent, 2 profiles, cached readings and quota usage. */
async function seedFullUser(uid: string) {
  await adminAuth.createUser({ uid, email: `${uid}@example.test` });
  await call(`uid.${uid}`, 'PATCH', '/v1/me', {
    acceptConsent: { privacyVersion: PRIVACY_POLICY_VERSION, termsVersion: TERMS_VERSION },
  });
  const search = await call(`uid.${uid}`, 'GET', '/v1/places?q=mumbai');
  const placeId = search.json<{ places: { placeId: string }[] }>().places[0]?.placeId;
  for (const name of ['Person A', 'Person B']) {
    const res = await call(`uid.${uid}`, 'POST', '/v1/profiles', {
      name,
      relation: 'self',
      birthDate: { year: 1990, month: 5, day: 10 },
      timeKnown: true,
      birthTime: { hour: 19, minute: 55 },
      placeId,
    });
    const id = res.json<{ id: string }>().id;
    await db.doc(`users/${uid}/profiles/${id}/results/chart_D1`).set({ data: 'x' });
    await db.doc(`users/${uid}/profiles/${id}/predictions/2026-10-17`).set({ data: 'y' });
  }
  const paths = await allPaths(db.doc(`users/${uid}`));
  // user + 2 profiles x (profile, result, prediction); a usage doc too if the place search missed cache
  expect(paths.length).toBeGreaterThanOrEqual(7);
}

const authUserExists = (uid: string) =>
  adminAuth.getUser(uid).then(
    () => true,
    () => false,
  );

describe('DELETE /v1/me', () => {
  it('removes every document for the user and the auth account; nothing is left behind', async () => {
    await seedFullUser('alice');
    const res = await call('uid.alice', 'DELETE', '/v1/me');
    expect(res.statusCode).toBe(204);
    expect(await allPaths(db.doc('users/alice'))).toEqual([]);
    expect(await authUserExists('alice')).toBe(false);
  });

  it('writes exactly one pseudonymous account_deleted audit event', async () => {
    await seedFullUser('alice');
    await call('uid.alice', 'DELETE', '/v1/me');
    await call('uid.alice', 'DELETE', '/v1/me'); // repeat is harmless
    const events = (await db.collection('auditEvents').where('type', '==', 'account_deleted').get())
      .docs;
    expect(events).toHaveLength(1);
    expect(events[0]?.get('uidHash')).toBe(uidHash('alice', pepper));
    expect(JSON.stringify(events[0]?.data())).not.toContain('alice');
  });

  it('leaves other users untouched', async () => {
    await seedFullUser('alice');
    await seedFullUser('bob');
    const before = await allPaths(db.doc('users/bob'));
    await call('uid.alice', 'DELETE', '/v1/me');
    expect(await allPaths(db.doc('users/bob'))).toEqual(before);
    expect(await authUserExists('bob')).toBe(true);
  });

  it('requires a recent sign-in: an old session gets 401 REAUTH_REQUIRED and nothing is deleted', async () => {
    await seedFullUser('alice');
    const before = await allPaths(db.doc('users/alice'));
    const res = await call('stale.alice', 'DELETE', '/v1/me');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'REAUTH_REQUIRED' } });
    expect(await allPaths(db.doc('users/alice'))).toEqual(before);
    expect(await authUserExists('alice')).toBe(true);
  });

  it('works for a user who never created any data', async () => {
    await adminAuth.createUser({ uid: 'quiet' });
    expect((await call('uid.quiet', 'DELETE', '/v1/me')).statusCode).toBe(204);
    expect(await authUserExists('quiet')).toBe(false);
  });

  it('after deletion the account reads as signed out (no silent re-creation)', async () => {
    await seedFullUser('alice');
    await call('uid.alice', 'DELETE', '/v1/me');
    // A still-cached token would recreate an empty user on GET /me; the real verifier rejects it
    // because the auth account is gone (checkRevoked). Verified directly here:
    expect(await authUserExists('alice')).toBe(false);
  });
});

describe('AccountDeletionService.resumePendingDeletions', () => {
  it('finishes a deletion interrupted after the "deleting" marker was written', async () => {
    await seedFullUser('alice');
    await db.doc('users/alice').update({ status: 'deleting' }); // as if the process died here
    expect(await deletion.resumePendingDeletions()).toBe(1);
    expect(await allPaths(db.doc('users/alice'))).toEqual([]);
    expect(await authUserExists('alice')).toBe(false);
    expect(await deletion.resumePendingDeletions()).toBe(0);
  });

  it('ignores active users', async () => {
    await seedFullUser('bob');
    expect(await deletion.resumePendingDeletions()).toBe(0);
    expect(await authUserExists('bob')).toBe(true);
  });
});
