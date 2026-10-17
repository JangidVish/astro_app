import { StyleSheet, View } from 'react-native';
import type { PredictionResponse } from '@astro/shared';
import { Card, Text } from '@/components/ui';
import { t, type MessageKey } from '@/i18n/en';
import { spacing } from '@/theme/tokens';

const SECTIONS: { key: keyof PredictionResponse['sections']; label: MessageKey }[] = [
  { key: 'personalLife', label: 'prediction.personalLife' },
  { key: 'profession', label: 'prediction.profession' },
  { key: 'health', label: 'prediction.health' },
  { key: 'emotions', label: 'prediction.emotions' },
  { key: 'luck', label: 'prediction.luck' },
  { key: 'travel', label: 'prediction.travel' },
];

/** One day's prediction, exactly as the provider wrote it (no generated text, FR-21). */
export function PredictionView({ prediction }: { prediction: PredictionResponse }) {
  return (
    <View style={styles.list}>
      <Card>
        <Text variant="caption" color="textMuted">
          {t('prediction.basis')}
        </Text>
        <Text variant="label">
          {prediction.moonSign} · {prediction.nakshatra}
        </Text>
        {prediction.timeAssumedNoon && (
          <Text variant="caption" color="textMuted">
            {t('chart.noonNote')}
          </Text>
        )}
      </Card>
      {SECTIONS.map((s) => (
        <Card key={s.key}>
          <Text variant="subheading">{t(s.label)}</Text>
          <Text>{prediction.sections[s.key]}</Text>
        </Card>
      ))}
      <Text variant="caption" color="textMuted">
        {t('consent.disclaimer')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.sm } });
