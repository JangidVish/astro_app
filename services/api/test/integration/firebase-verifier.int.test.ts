// Integration: the real FirebaseTokenVerifier (firebase-admin) against the Auth emulator.
// Run via `npm test`, which starts the emulator and sets FIREBASE_AUTH_EMULATOR_HOST.
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { beforeAll, describe, expect, it } from 'vitest';
import { FirebaseTokenVerifier, TokenRejectedError } from '../../src/modules/auth/verifier.js';

const PROJECT_ID = 'demo-astro-app';
const EMULATOR = process.env['FIREBASE_AUTH_EMULATOR_HOST'];

/** Signs up a user on the emulator and returns a real (emulator-issued) ID token. */
async function signUp(email: string): Promise<{ uid: string; idToken: string }> {
  const res = await fetch(
    `http://${String(EMULATOR)}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'correct-horse-battery', returnSecureToken: true }),
    },
  );
  expect(res.ok).toBe(true);
  const body = (await res.json()) as { localId: string; idToken: string };
  return { uid: body.localId, idToken: body.idToken };
}

/** Builds an unsigned emulator-style token with chosen claims (the emulator does not sign). */
function craftToken(claims: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(claims)}.`;
}

function claimsFor(uid: string, overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    auth_time: now - 60,
    user_id: uid,
    sub: uid,
    iat: now - 60,
    exp: now + 3600,
    firebase: { identities: {}, sign_in_provider: 'password' },
    ...overrides,
  };
}

async function rejection(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof TokenRejectedError) return error.reason;
    throw error;
  }
  throw new Error('expected the token to be rejected');
}

const verifier = new FirebaseTokenVerifier(PROJECT_ID);
const adminAuth = () =>
  getAuth(
    getApps().find((a) => a.name === 'test-admin') ??
      initializeApp({ projectId: PROJECT_ID }, 'test-admin'),
  );

beforeAll(() => {
  if (!EMULATOR) throw new Error('FIREBASE_AUTH_EMULATOR_HOST is not set; run via npm test');
});

describe('FirebaseTokenVerifier (Auth emulator)', () => {
  it('accepts a genuine ID token and returns uid and auth time', async () => {
    const { uid, idToken } = await signUp(`ok-${String(Date.now())}@example.test`);
    const identity = await verifier.verifyIdToken(idToken);
    expect(identity.uid).toBe(uid);
    expect(identity.authTime).toBeGreaterThan(1_700_000_000);
  });

  it('rejects an expired token', async () => {
    const { uid } = await signUp(`exp-${String(Date.now())}@example.test`);
    const now = Math.floor(Date.now() / 1000);
    const token = craftToken(claimsFor(uid, { iat: now - 7200, exp: now - 3600 }));
    expect(await rejection(verifier.verifyIdToken(token))).toBe('id_token_expired');
  });

  it('rejects a token issued for another Firebase project', async () => {
    const { uid } = await signUp(`aud-${String(Date.now())}@example.test`);
    const token = craftToken(
      claimsFor(uid, { aud: 'other-project', iss: 'https://securetoken.google.com/other-project' }),
    );
    expect(await rejection(verifier.verifyIdToken(token))).toBe('id_token_invalid');
  });

  it.each(['not-a-jwt', 'a.b.c', ''])('rejects malformed token %j', async (token) => {
    expect(await rejection(verifier.verifyIdToken(token))).toBe('id_token_invalid');
  });

  it('rejects a token after its refresh tokens are revoked', async () => {
    const { uid, idToken } = await signUp(`rev-${String(Date.now())}@example.test`);
    // Revocation compares whole seconds: make sure the revocation is strictly later.
    await new Promise((r) => setTimeout(r, 1100));
    await adminAuth().revokeRefreshTokens(uid);
    expect(await rejection(verifier.verifyIdToken(idToken))).toBe('id_token_revoked');
  });

  it('rejects a token of a disabled user', async () => {
    const { uid, idToken } = await signUp(`dis-${String(Date.now())}@example.test`);
    await adminAuth().updateUser(uid, { disabled: true });
    expect(await rejection(verifier.verifyIdToken(idToken))).toBe('user_disabled');
  });

  it('rejects a token of a deleted user', async () => {
    const { uid, idToken } = await signUp(`del-${String(Date.now())}@example.test`);
    await adminAuth().deleteUser(uid);
    expect(await rejection(verifier.verifyIdToken(idToken))).toBe('id_token_invalid');
  });
});
