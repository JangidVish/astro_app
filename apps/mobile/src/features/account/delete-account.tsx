import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { messageFor } from '@/auth/messages';
import { Button, ErrorBanner, TextField } from '@/components/form';
import { Card, Text } from '@/components/ui';
import { t } from '@/i18n/en';
import { ApiError } from '@/lib/api-client';
import { useApi } from '@/lib/api-context';

/**
 * Account deletion (FR-2; Apple guideline 5.1.1(v)). Re-authenticates first, refreshes the ID token
 * so the server sees a recent sign-in, deletes, then clears local data and signs out.
 */
export function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const api = useApi();
  const { state, service } = useAuth();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const providers = state.status === 'signedIn' ? state.user.providers : [];
  const usesPassword = providers.includes('password');

  async function remove() {
    setError(null);
    if (usesPassword && password.length === 0) {
      setError(t('delete.passwordPrompt'));
      return;
    }
    setBusy(true);
    try {
      await service.reauthenticate(usesPassword ? { password } : {});
      await service.getIdToken(true); // new token carries the fresh sign-in time
      await api.deleteMe();
      queryClient.clear(); // no personal data left in memory
      await service.signOut();
      onDeleted();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'REAUTH_REQUIRED') setError(t('delete.reauthAgain'));
      else if (e instanceof ApiError)
        setError(
          t(e.code === 'NETWORK' || e.code === 'TIMEOUT' ? 'common.offline' : 'common.error'),
        );
      else setError(t(messageFor(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Text variant="subheading">{t('delete.title')}</Text>
        <Text>{t('delete.body')}</Text>
      </Card>
      <ErrorBanner message={error} />
      {usesPassword ? (
        <TextField
          label={t('auth.password')}
          hint={t('delete.passwordPrompt')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          testID="delete-password"
        />
      ) : (
        <Text color="textMuted">{t('delete.applePrompt')}</Text>
      )}
      <Button
        label={t('delete.confirm')}
        variant="danger"
        onPress={() => void remove()}
        loading={busy}
        testID="delete-confirm"
      />
    </View>
  );
}
