import type { MessageKey } from '@/i18n/en';
import { ApiError } from '@/lib/api-client';
import { AuthError, type AuthErrorReason } from './auth-service';

const AUTH_MESSAGES: Record<AuthErrorReason, MessageKey> = {
  invalid_credentials: 'auth.error.invalidCredentials',
  email_in_use: 'auth.error.emailInUse',
  weak_password: 'auth.error.weakPassword',
  invalid_email: 'auth.error.invalidEmail',
  too_many_attempts: 'auth.error.tooManyAttempts',
  network: 'auth.error.network',
  cancelled: 'auth.error.cancelled',
  unknown: 'auth.error.unknown',
};

/** User-facing message for any error thrown by auth or API calls on auth screens. */
export function messageFor(error: unknown): MessageKey {
  if (error instanceof AuthError) return AUTH_MESSAGES[error.reason];
  if (error instanceof ApiError && (error.code === 'NETWORK' || error.code === 'TIMEOUT')) {
    return 'auth.error.network';
  }
  return 'auth.error.unknown';
}
