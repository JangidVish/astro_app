import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Screen, Text } from '@/components/ui';
import { usePrediction } from '@/features/chart/hooks';
import { ReadingError } from '@/features/chart/reading-error';
import { localIsoDate } from '@/features/readings/dates';
import { PredictionView } from '@/features/readings/prediction-view';
import { t, type MessageKey } from '@/i18n/en';
import { MIN_TOUCH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const DAYS: { offset: number; label: MessageKey }[] = [
  { offset: -1, label: 'prediction.yesterday' },
  { offset: 0, label: 'prediction.today' },
  { offset: 1, label: 'prediction.tomorrow' },
];

export default function PredictionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const [offset, setOffset] = useState(0);
  const date = useMemo(() => localIsoDate(new Date(), offset), [offset]);
  const prediction = usePrediction(id, date);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('prediction.title'), headerShown: true }} />
      <View style={styles.tabs} accessibilityRole="tablist">
        {DAYS.map((d) => {
          const selected = d.offset === offset;
          return (
            <Pressable
              key={d.offset}
              onPress={() => setOffset(d.offset)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={t(d.label)}
              style={[
                styles.tab,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? colors.primary : colors.surface,
                },
              ]}
            >
              <Text variant="label" style={{ color: selected ? colors.onPrimary : colors.text }}>
                {t(d.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {prediction.isPending && <ActivityIndicator accessibilityLabel={t('common.loading')} />}
      {prediction.isError && (
        <ReadingError error={prediction.error} onRetry={() => void prediction.refetch()} />
      )}
      {prediction.data && <PredictionView prediction={prediction.data} />}
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
    paddingHorizontal: spacing.xs,
  },
});
