import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { ChartType } from '@astro/shared';
import { Card, Screen, Text } from '@/components/ui';
import { useChart, usePlanets } from '@/features/chart/hooks';
import { NorthIndianChart } from '@/features/chart/north-indian-chart';
import { PlanetTable } from '@/features/chart/planet-table';
import { ReadingError } from '@/features/chart/reading-error';
import { useProfile } from '@/features/profiles/hooks';
import { t } from '@/i18n/en';
import { MIN_TOUCH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const TABS: { type: ChartType; label: 'chart.d1' | 'chart.d9' }[] = [
  { type: 'D1', label: 'chart.d1' },
  { type: 'D9', label: 'chart.d9' },
];

export default function ChartScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
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
          <View style={styles.tabs} accessibilityRole="tablist">
            {TABS.map((tab) => {
              const selected = tab.type === type;
              return (
                <Pressable
                  key={tab.type}
                  onPress={() => setType(tab.type)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  accessibilityLabel={t(tab.label)}
                  style={[
                    styles.tab,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected ? colors.primary : colors.surface,
                    },
                  ]}
                >
                  <Text
                    variant="label"
                    style={{ color: selected ? colors.onPrimary : colors.text }}
                  >
                    {t(tab.label)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {chart.isPending && <ActivityIndicator accessibilityLabel={t('common.loading')} />}
          {chart.isError && (
            <ReadingError error={chart.error} onRetry={() => void chart.refetch()} />
          )}
          {chart.data && (
            <>
              <View style={styles.center}>
                <NorthIndianChart
                  houses={chart.data.houses}
                  planets={chart.data.planets}
                  title={t(type === 'D1' ? 'chart.d1' : 'chart.d9')}
                />
              </View>
              <Text variant="subheading">{t('chart.planets')}</Text>
              <PlanetTable planets={chart.data.planets} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: spacing.sm },
  tab: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  center: { alignItems: 'center' },
});
