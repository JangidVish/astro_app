import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/auth/auth-context';
import { AuthError, type AuthService, type AuthUser } from '@/auth/auth-service';
import { ApiError, type ApiClient } from '@/lib/api-client';
import { ApiProvider } from '@/lib/api-context';
import { t } from '@/i18n/en';
import { DeleteAccount } from './delete-account';

function fakeAuth(user: AuthUser, overrides: Partial<AuthService> = {}) {
  const calls: string[] = [];
  const service: AuthService = {
    onAuthStateChanged: (listener) => {
      listener(user);
      return () => undefined;
    },
    signInWithEmail: () => Promise.resolve(),
    signUpWithEmail: () => Promise.resolve(),
    sendPasswordReset: () => Promise.resolve(),
    google: null,
    apple: null,
    signOut: () => {
      calls.push('signOut');
      return Promise.resolve();
    },
    getIdToken: (force) => {
      calls.push(`token:${String(force)}`);
      return Promise.resolve('t');
    },
    reauthenticate: (c) => {
      calls.push(`reauth:${c.password ?? 'apple'}`);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { service, calls };
}

async function setup(
  user: AuthUser,
  api: Partial<ApiClient>,
  overrides: Partial<AuthService> = {},
) {
  const { service, calls } = fakeAuth(user, overrides);
  const queryClient = new QueryClient();
  queryClient.setQueryData(['profiles', 'list'], { profiles: ['secret'] });
  const onDeleted = jest.fn();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AuthProvider service={service}>
        <QueryClientProvider client={queryClient}>
          <ApiProvider getIdToken={() => Promise.resolve('t')} client={api as ApiClient}>
            {children}
          </ApiProvider>
        </QueryClientProvider>
      </AuthProvider>
    );
  }
  await render(<DeleteAccount onDeleted={onDeleted} />, { wrapper: Wrapper });
  return { calls, onDeleted, queryClient };
}

const passwordUser: AuthUser = { uid: 'u1', email: 'a@b.co', providers: ['password'] };
const appleUser: AuthUser = { uid: 'u2', email: null, providers: ['apple.com'] };

describe('DeleteAccount', () => {
  it('re-authenticates, refreshes the token, deletes, clears local data and signs out, in that order', async () => {
    const order: string[] = [];
    const deleteMe = jest.fn(() => {
      order.push('deleteMe');
      return Promise.resolve();
    });
    const { calls, onDeleted, queryClient } = await setup(passwordUser, { deleteMe });
    await fireEvent.changeText(screen.getByTestId('delete-password'), 'correct-horse');
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    await waitFor(() => {
      expect(onDeleted).toHaveBeenCalled();
    });
    expect(calls).toEqual(['reauth:correct-horse', 'token:true', 'signOut']);
    expect(deleteMe).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(['profiles', 'list'])).toBeUndefined();
  });

  it('requires the password before doing anything', async () => {
    const deleteMe = jest.fn();
    const { calls } = await setup(passwordUser, { deleteMe });
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    expect(await screen.findAllByText(t('delete.passwordPrompt'))).not.toHaveLength(0);
    expect(calls).toEqual([]);
    expect(deleteMe).not.toHaveBeenCalled();
  });

  it('wrong password: nothing is deleted and the user is told', async () => {
    const deleteMe = jest.fn();
    await setup(
      passwordUser,
      { deleteMe },
      { reauthenticate: () => Promise.reject(new AuthError('invalid_credentials')) },
    );
    await fireEvent.changeText(screen.getByTestId('delete-password'), 'nope');
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    expect(await screen.findByText(t('auth.error.invalidCredentials'))).toBeTruthy();
    expect(deleteMe).not.toHaveBeenCalled();
  });

  it('server says the sign-in is too old: asks to confirm again and stays signed in', async () => {
    const deleteMe = jest.fn(() =>
      Promise.reject(new ApiError('REAUTH_REQUIRED', 401, 'x', false)),
    );
    const { calls, onDeleted } = await setup(passwordUser, { deleteMe });
    await fireEvent.changeText(screen.getByTestId('delete-password'), 'correct-horse');
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    expect(await screen.findByText(t('delete.reauthAgain'))).toBeTruthy();
    expect(calls).not.toContain('signOut');
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('Apple accounts re-authenticate with Apple (no password field)', async () => {
    const deleteMe = jest.fn(() => Promise.resolve());
    const { calls } = await setup(appleUser, { deleteMe });
    expect(screen.queryByTestId('delete-password')).toBeNull();
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    await waitFor(() => {
      expect(deleteMe).toHaveBeenCalled();
    });
    expect(calls[0]).toBe('reauth:apple');
  });

  it('offline: clear message, account kept', async () => {
    const deleteMe = jest.fn(() => Promise.reject(new ApiError('NETWORK', 0, 'x', true)));
    const { onDeleted } = await setup(passwordUser, { deleteMe });
    await fireEvent.changeText(screen.getByTestId('delete-password'), 'correct-horse');
    await fireEvent.press(screen.getByTestId('delete-confirm'));
    expect(await screen.findByText(t('common.offline'))).toBeTruthy();
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
