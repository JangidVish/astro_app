import type { MeResponse } from '@astro/shared';
import type { AuthState } from './auth-context';

export type Destination = 'splash' | 'sign-in' | 'consent' | 'app';

/**
 * Where a user belongs right now. Pure so it can be unit-tested:
 * - auth still resolving, or profile (`me`) still loading -> splash
 * - signed out -> sign-in
 * - signed in but consent missing or outdated -> consent (profiles are blocked server-side too)
 * - otherwise -> app
 */
export function routeFor(auth: AuthState, me: MeResponse | undefined): Destination {
  if (auth.status === 'loading') return 'splash';
  if (auth.status === 'signedOut') return 'sign-in';
  if (!me) return 'splash';
  return me.consentRequired ? 'consent' : 'app';
}
