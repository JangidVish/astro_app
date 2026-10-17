import { getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getAuth } from 'firebase-admin/auth';

/** Identity established from a verified Firebase ID token. */
export interface VerifiedIdentity {
  readonly uid: string;
  /** When the user last signed in (Unix seconds). Used for re-authentication checks. */
  readonly authTime: number;
}

/** Why a token was rejected. Logged for operators; never sent to clients. */
export type AuthFailureReason =
  | 'id_token_expired'
  | 'id_token_revoked'
  | 'user_disabled'
  | 'id_token_invalid'
  | 'app_check_invalid';

/** The token is bad: respond 401. */
export class TokenRejectedError extends Error {
  constructor(readonly reason: AuthFailureReason) {
    super(`token rejected: ${reason}`);
    this.name = 'TokenRejectedError';
  }
}

/** Verification could not be completed (e.g. Google endpoints unreachable): respond 503. */
export class VerifierUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('token verification unavailable', options);
    this.name = 'VerifierUnavailableError';
  }
}

export interface TokenVerifier {
  verifyIdToken(token: string): Promise<VerifiedIdentity>;
  verifyAppCheckToken(token: string): Promise<void>;
}

/** Firebase error codes that mean "this token is bad", as opposed to "we could not check". */
const ID_TOKEN_REJECTIONS: Record<string, AuthFailureReason> = {
  'auth/id-token-expired': 'id_token_expired',
  'auth/id-token-revoked': 'id_token_revoked',
  'auth/user-disabled': 'user_disabled',
  'auth/user-not-found': 'id_token_invalid',
  'auth/argument-error': 'id_token_invalid',
  'auth/invalid-id-token': 'id_token_invalid',
};

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * Verifies tokens with firebase-admin. On Cloud Run, credentials come from the service account
 * (Application Default Credentials); locally, FIREBASE_AUTH_EMULATOR_HOST routes to the emulator.
 */
export class FirebaseTokenVerifier implements TokenVerifier {
  private readonly app: App;

  constructor(projectId: string) {
    this.app =
      getApps().find((a) => a.name === 'astro-api') ?? initializeApp({ projectId }, 'astro-api');
  }

  async verifyIdToken(token: string): Promise<VerifiedIdentity> {
    try {
      // checkRevoked: reject tokens of disabled users and tokens issued before a revocation.
      const decoded = await getAuth(this.app).verifyIdToken(token, true);
      return { uid: decoded.uid, authTime: decoded.auth_time };
    } catch (error) {
      const code = errorCode(error);
      const reason = code === undefined ? undefined : ID_TOKEN_REJECTIONS[code];
      if (reason) throw new TokenRejectedError(reason);
      // Malformed tokens surface as generic errors with an auth/ prefix we do not list above.
      if (code?.startsWith('auth/') && code !== 'auth/internal-error') {
        throw new TokenRejectedError('id_token_invalid');
      }
      throw new VerifierUnavailableError({ cause: error });
    }
  }

  async verifyAppCheckToken(token: string): Promise<void> {
    try {
      await getAppCheck(this.app).verifyToken(token);
    } catch (error) {
      const code = errorCode(error);
      if (code?.startsWith('app-check/') && code !== 'app-check/internal-error') {
        throw new TokenRejectedError('app_check_invalid');
      }
      throw new VerifierUnavailableError({ cause: error });
    }
  }
}
