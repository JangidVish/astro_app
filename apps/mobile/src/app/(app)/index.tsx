import { Stack } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/form';
import { Card, Screen, Text } from '@/components/ui';
import { useMe } from '@/features/account/use-me';
import { t } from '@/i18n/en';

/** Home. Profiles, charts and predictions are added in T8.3-T8.6. */
export default function Home() {
  const { service } = useAuth();
  const me = useMe();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('app.name') }} />
      <Text variant="title">{t('app.name')}</Text>
      <Card>
        <Text>{me.data?.profileCount ?? 0} / 5</Text>
      </Card>
      <Button
        label={t('auth.signOut')}
        variant="secondary"
        onPress={() => void service.signOut()}
      />
    </Screen>
  );
}
