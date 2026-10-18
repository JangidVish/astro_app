import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';
import type { ChartType } from '@astro/shared';
import { SegmentedTabs } from '@/components/form';
import { Card, Screen, Text } from '@/components/ui';
import { useChart, usePlanets } from '@/features/chart/hooks';
import { NorthIndianChart } from '@/features/chart/north-indian-chart';
import { PlanetTable } from '@/features/chart/planet-table';
import { ReadingError } from '@/features/chart/reading-error';
import { useProfile } from '@/features/profiles/hooks';
import { t } from '@/i18n/en';

export default function ChartScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [type, setType] = useState<ChartType>('D1');
  const profile = useProfile(id);
  const timeKnown = profile.data?.timeKnown ?? true;
  const chart = useChart(id, type, profile.isSuccess && timeKnown);
  const planets = usePlanets(id);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('chart.title'), headerShown: true }} />
      {profile.isSuccess && !timeKnown ? (
        <>
          <Card>
            <Text>{t('chart.timeUnknown')}</Text>
          </Card>
          {planets.isPending && <ActivityIndicator accessibilityLabel={t('common.loading')} />}
          {planets.isError && (
            <ReadingError error={planets.error} onRetry={() => void planets.refetch()} />
          )}
          {planets.data && (
            <>
              <Text variant="caption" color="textMuted">
                {t('chart.noonNote')}
              </Text>
              <PlanetTable planets={planets.data.planets} />
            </>
          )}
        </>
      ) : (
        <>
          <SegmentedTabs
            options={[
              { value: 'D1', label: t('chart.d1'), icon: 'all-inclusive' },
              { value: 'D9', label: t('chart.d9'), icon: 'grid-on' },
            ]}
            value={type}
            onChange={setType}
          />
          {chart.isPending && <ActivityIndicator accessibilityLabel={t('common.loading')} />}
          {chart.isError && (
            <ReadingError error={chart.error} onRetry={() => void chart.refetch()} />
          )}
          {chart.data && (
            <>
              <NorthIndianChart
                houses={chart.data.houses}
                planets={chart.data.planets}
                title={t(type === 'D1' ? 'chart.d1' : 'chart.d9')}
              />
              <Text variant="subheading">{t('chart.planets')}</Text>
              <PlanetTable planets={chart.data.planets} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
