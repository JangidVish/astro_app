import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { SegmentedTabs } from '@/components/form';
import { Screen } from '@/components/ui';
import { usePrediction } from '@/features/chart/hooks';
import { ReadingError } from '@/features/chart/reading-error';
import { localIsoDate } from '@/features/readings/dates';
import { PredictionView } from '@/features/readings/prediction-view';
import { t, type MessageKey } from '@/i18n/en';

const DAYS: { offset: number; label: MessageKey }[] = [
  { offset: -1, label: 'prediction.yesterday' },
  { offset: 0, label: 'prediction.today' },
  { offset: 1, label: 'prediction.tomorrow' },
];

export default function PredictionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [offset, setOffset] = useState(0);
  const date = useMemo(() => localIsoDate(new Date(), offset), [offset]);
  const prediction = usePrediction(id, date);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('prediction.title'), headerShown: true }} />
      <SegmentedTabs
        options={DAYS.map((d) => ({ value: String(d.offset), label: t(d.label) }))}
        value={String(offset)}
        onChange={(value) => setOffset(Number(value))}
      />
      {prediction.isPending && <ActivityIndicator accessibilityLabel={t('common.loading')} />}
      {prediction.isError && (
        <ReadingError error={prediction.error} onRetry={() => void prediction.refetch()} />
      )}
      {prediction.data && <PredictionView prediction={prediction.data} />}
    </Screen>
  );
}
