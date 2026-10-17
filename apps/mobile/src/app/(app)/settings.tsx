import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@astro/shared';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/form';
import { Card, Screen, Text } from '@/components/ui';
import { DeleteAccount } from '@/features/account/delete-account';
import { t } from '@/i18n/en';

export default function Settings() {
  const { state, service } = useAuth();
  const [deleting, setDeleting] = useState(false);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.title'), headerShown: true }} />
      <Card>
        <Text variant="subheading">{t('settings.account')}</Text>
        {state.status === 'signedIn' && state.user.email && <Text>{state.user.email}</Text>}
        <Button
          label={t('auth.signOut')}
          variant="secondary"
          onPress={() => void service.signOut()}
        />
      </Card>

      <Card>
        <Text variant="subheading">{t('settings.legal')}</Text>
        {/* Links to the published texts are added with the final legal copy (backlog M0.6). */}
        <Text>
          {t('consent.privacy')}: {PRIVACY_POLICY_VERSION}
        </Text>
        <Text>
          {t('consent.terms')}: {TERMS_VERSION}
        </Text>
        <Text color="textMuted">{t('consent.disclaimer')}</Text>
        <Text variant="caption" color="textMuted">
          {t('settings.version')}: {Constants.expoConfig?.version ?? '—'}
        </Text>
      </Card>

      {deleting ? (
        <DeleteAccount onDeleted={() => router.replace('/sign-in')} />
      ) : (
        <Button
          label={t('settings.deleteAccount')}
          variant="danger"
          onPress={() => setDeleting(true)}
          testID="start-delete"
        />
      )}
    </Screen>
  );
}
