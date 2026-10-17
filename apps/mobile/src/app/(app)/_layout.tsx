import { Redirect, Stack, usePathname } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { routeFor } from '@/auth/route-for';
import { Button } from '@/components/form';
import { Screen, Text } from '@/components/ui';
import { useMe } from '@/features/account/use-me';
import { t } from '@/i18n/en';
import { useTheme } from '@/theme/use-theme';

/** Signed-in area. Sends signed-out users to sign-in and users without consent to /consent. */
export default function AppLayout() {
  const { state } = useAuth();
  const me = useMe();
  const pathname = usePathname();
  const { colors } = useTheme();

  if (me.isError) {
    return (
      <Screen>
        <Text>{t('common.offline')}</Text>
        <Button label={t('common.retry')} onPress={() => void me.refetch()} />
      </Screen>
    );
  }

  const destination = routeFor(state, me.data);
  if (destination === 'sign-in') return <Redirect href="/sign-in" />;
  if (destination === 'splash') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }
  if (destination === 'consent' && pathname !== '/consent') return <Redirect href="/consent" />;
  return <Stack />;
}
