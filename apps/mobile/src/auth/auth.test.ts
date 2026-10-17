import { ApiError } from '@/lib/api-client';
import type { MeResponse } from '@astro/shared';
import { AuthError, authErrorReason, toAuthError } from './auth-service';
import { messageFor } from './messages';
import { routeFor } from './route-for';
import { validateEmail, validatePassword } from './validation';

describe('authErrorReason', () => {
  it.each([
    ['auth/invalid-credential', 'invalid_credentials'],
    ['auth/wrong-password', 'invalid_credentials'],
    ['auth/user-not-found', 'invalid_credentials'],
    ['auth/email-already-in-use', 'email_in_use'],
    ['auth/weak-password', 'weak_password'],
    ['auth/invalid-email', 'invalid_email'],
    ['auth/too-many-requests', 'too_many_attempts'],
    ['auth/network-request-failed', 'network'],
    ['ERR_REQUEST_CANCELED', 'cancelled'],
    ['auth/something-new', 'unknown'],
    [undefined, 'unknown'],
  ])('%s -> %s', (code, reason) => {
    expect(authErrorReason(code)).toBe(reason);
  });

  it('wrong password and unknown account give the same message (no account enumeration)', () => {
    expect(messageFor(toAuthError({ code: 'auth/wrong-password' }))).toBe(
      messageFor(toAuthError({ code: 'auth/user-not-found' })),
    );
  });

  it('wraps unknown errors and keeps AuthErrors as they are', () => {
    const existing = new AuthError('network');
    expect(toAuthError(existing)).toBe(existing);
    expect(toAuthError(new Error('boom')).reason).toBe('unknown');
  });

  it('maps API connectivity errors to the network message', () => {
    expect(messageFor(new ApiError('NETWORK', 0, 'x', true))).toBe('auth.error.network');
    expect(messageFor(new ApiError('INTERNAL', 500, 'x', true))).toBe('auth.error.unknown');
  });
});

describe('validation', () => {
  it.each(['a@b.co', ' user.name+tag@example.org '])('accepts %j', (email) => {
    expect(validateEmail(email)).toBeNull();
  });
  it.each(['', 'plain', 'a@b', '@b.co', 'a b@c.de'])('rejects %j', (email) => {
    expect(validateEmail(email)).toBe('auth.error.invalidEmail');
  });
  it('requires 8+ character passwords', () => {
    expect(validatePassword('1234567')).toBe('auth.error.passwordTooShort');
    expect(validatePassword('12345678')).toBeNull();
  });
});

describe('routeFor', () => {
  const me = (consentRequired: boolean): MeResponse => ({
    displayName: null,
    consent: null,
    consentRequired,
    primaryProfileId: null,
    profileCount: 0,
  });
  const signedIn = {
    status: 'signedIn',
    user: { uid: 'u', email: null, providers: ['password'] },
  } as const;

  it.each([
    ['auth resolving', { status: 'loading' } as const, undefined, 'splash'],
    ['signed out', { status: 'signedOut' } as const, undefined, 'sign-in'],
    ['signed in, account loading', signedIn, undefined, 'splash'],
    ['signed in, consent needed', signedIn, me(true), 'consent'],
    ['signed in, consent given', signedIn, me(false), 'app'],
  ])('%s -> %s', (_label, auth, account, destination) => {
    expect(routeFor(auth, account)).toBe(destination);
  });
});
