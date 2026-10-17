/** The signed-in user as the app needs it. Email is shown in Settings only. */
export interface AuthUser {
  readonly uid: string;
  readonly email: string | null;
}

/**
 * Authentication operations. Screens depend on this interface only, so the implementation
 * (Firebase JS SDK today, possibly @react-native-firebase later) can change without touching UI.
 */
export interface AuthService {
  /** Calls back immediately with the current user (or null), then on every change. */
  onAuthStateChanged(listener: (user: AuthUser | null) => void): () => void;
  signInWithEmail(email: string, password: string): Promise<void>;
  signUpWithEmail(email: string, password: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  /** Null when the provider is not configured for this build. */
  readonly google: { signIn(): Promise<void> } | null;
  readonly apple: { signIn(): Promise<void> } | null;
  signOut(): Promise<void>;
  /** Fresh Firebase ID token for API calls, or null when signed out. */
  getIdToken(): Promise<string | null>;
}

/** Stable reasons for auth failures; the UI maps these to messages. */
export type AuthErrorReason =
  | 'invalid_credentials'
  | 'email_in_use'
  | 'weak_password'
  | 'invalid_email'
  | 'too_many_attempts'
  | 'network'
  | 'cancelled'
  | 'unknown';

export class AuthError extends Error {
  constructor(readonly reason: AuthErrorReason) {
    super(reason);
    this.name = 'AuthError';
  }
}

/** Maps Firebase Auth error codes to our reasons. Unlisted codes become 'unknown'. */
export function authErrorReason(code: unknown): AuthErrorReason {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-login-credentials':
      // Same message for all: never reveal whether an email has an account.
      return 'invalid_credentials';
    case 'auth/email-already-in-use':
      return 'email_in_use';
    case 'auth/weak-password':
      return 'weak_password';
    case 'auth/invalid-email':
      return 'invalid_email';
    case 'auth/too-many-requests':
      return 'too_many_attempts';
    case 'auth/network-request-failed':
      return 'network';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'ERR_REQUEST_CANCELED':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

export function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  return new AuthError(authErrorReason(code));
}
