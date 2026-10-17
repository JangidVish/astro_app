import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthService, AuthUser } from './auth-service';

export type AuthState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: AuthUser };

interface AuthContextValue {
  state: AuthState;
  service: AuthService;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ service, children }: { service: AuthService; children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(
    () =>
      service.onAuthStateChanged((user) => {
        setState(user ? { status: 'signedIn', user } : { status: 'signedOut' });
      }),
    [service],
  );

  return <AuthContext.Provider value={{ state, service }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
