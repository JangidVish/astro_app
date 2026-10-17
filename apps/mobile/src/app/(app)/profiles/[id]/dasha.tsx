import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Card, Screen, Text } from '@/components/ui';
import { useDasha } from '@/features/chart/hooks';
import { ReadingError } from '@/features/chart/reading-error';
import { useProfile } from '@/features/profiles/hooks';
import { DashaList } from '@/features/readings/dasha-list';
import { t } from '@/i18n/en';

export default function DashaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile(id);
  const timeKnown = profile.data?.timeKnown ?? true;
  const dasha = useDasha(id, profile.isSuccess && timeKnown);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('dasha.title'), headerShown: true }} />
      {profile.isSuccess && !timeKnown ? (
        <Card>
          <Text>{t('chart.timeUnknown')}</Text>
        </Card>
      ) : (
        <>
          <Text color="textMuted">{t('dasha.intro')}</Text>
          {dasha.isPending && <ActivityIndicator accessibilityLabel={t('common.loading')} />}
          {dasha.isError && (
            <ReadingError error={dasha.error} onRetry={() => void dasha.refetch()} />
          )}
          {dasha.data && <DashaList profileId={id} periods={dasha.data.mahadashas} />}
        </>
      )}
    </Screen>
  );
}
