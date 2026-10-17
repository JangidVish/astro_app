// Unit tests with firebase-admin mocked. The emulator integration test cannot cover these:
// in emulator mode firebase-admin always checks revocation, so `checkRevoked` must be asserted here.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.fn();
const verifyToken = vi.fn();

vi.mock('firebase-admin/app', () => ({
  getApps: () => [],
  initializeApp: () => ({ name: 'astro-api' }),
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ verifyIdToken }) }));
vi.mock('firebase-admin/app-check', () => ({ getAppCheck: () => ({ verifyToken }) }));

const { FirebaseTokenVerifier, TokenRejectedError, VerifierUnavailableError } =
  await import('./verifier.js');

const firebaseError = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  verifyIdToken.mockReset();
  verifyToken.mockReset();
});

describe('FirebaseTokenVerifier.verifyIdToken', () => {
  it('always asks firebase-admin to check revocation', async () => {
    verifyIdToken.mockResolvedValue({ uid: 'u1', auth_time: 123 });
    const result = await new FirebaseTokenVerifier({ name: 'test' } as never).verifyIdToken('tok');
    expect(verifyIdToken).toHaveBeenCalledWith('tok', true);
    expect(result).toEqual({ uid: 'u1', authTime: 123 });
  });

  it.each([
    ['auth/id-token-expired', 'id_token_expired'],
    ['auth/id-token-revoked', 'id_token_revoked'],
    ['auth/user-disabled', 'user_disabled'],
    ['auth/user-not-found', 'id_token_invalid'],
    ['auth/argument-error', 'id_token_invalid'],
    ['auth/some-new-token-problem', 'id_token_invalid'],
  ])('maps %s to rejection reason %s', async (code, reason) => {
    verifyIdToken.mockRejectedValue(firebaseError(code));
    await expect(
      new FirebaseTokenVerifier({ name: 'test' } as never).verifyIdToken('tok'),
    ).rejects.toEqual(new TokenRejectedError(reason as never));
  });

  it.each([
    ['auth/internal-error', firebaseError('auth/internal-error')],
    ['network failure', firebaseError('app/network-error')],
    ['error without code', new Error('socket hang up')],
  ])('treats %s as unavailable (503), not as a bad token', async (_label, error) => {
    verifyIdToken.mockRejectedValue(error);
    await expect(
      new FirebaseTokenVerifier({ name: 'test' } as never).verifyIdToken('tok'),
    ).rejects.toBeInstanceOf(VerifierUnavailableError);
  });
});

describe('FirebaseTokenVerifier.verifyAppCheckToken', () => {
  it('passes a valid token', async () => {
    verifyToken.mockResolvedValue({ appId: 'app' });
    await expect(
      new FirebaseTokenVerifier({ name: 'test' } as never).verifyAppCheckToken('ac'),
    ).resolves.toBeUndefined();
    expect(verifyToken).toHaveBeenCalledWith('ac');
  });

  it('rejects an invalid token', async () => {
    verifyToken.mockRejectedValue(firebaseError('app-check/invalid-argument'));
    await expect(
      new FirebaseTokenVerifier({ name: 'test' } as never).verifyAppCheckToken('ac'),
    ).rejects.toEqual(new TokenRejectedError('app_check_invalid'));
  });

  it('treats internal or network errors as unavailable', async () => {
    verifyToken.mockRejectedValue(firebaseError('app-check/internal-error'));
    await expect(
      new FirebaseTokenVerifier({ name: 'test' } as never).verifyAppCheckToken('ac'),
    ).rejects.toBeInstanceOf(VerifierUnavailableError);
  });
});
