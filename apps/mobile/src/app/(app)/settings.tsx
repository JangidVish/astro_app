import { Stack } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/form';
import { Card, Screen, Text } from '@/components/ui';
import { t } from '@/i18n/en';

/** Settings. Account deletion, privacy and the disclaimer are added in T8.7. */
export default function Settings() {
  const { state, service } = useAuth();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Settings', headerShown: true }} />
      {state.status === 'signedIn' && state.user.email && (
        <Card>
          <Text variant="caption" color="textMuted">
            {t('auth.email')}
          </Text>
          <Text>{state.user.email}</Text>
        </Card>
      )}
      <Button
        label={t('auth.signOut')}
        variant="secondary"
        onPress={() => void service.signOut()}
      />
    </Screen>
  );
}
