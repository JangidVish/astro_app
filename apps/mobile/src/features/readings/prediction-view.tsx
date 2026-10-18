import { StyleSheet, View } from 'react-native';
import type { PredictionResponse } from '@astro/shared';
import { Card, Icon, IconTile, Text, type IconName } from '@/components/ui';
import { t, type MessageKey } from '@/i18n/en';
import { spacing } from '@/theme/tokens';

const SECTIONS: {
  key: keyof PredictionResponse['sections'];
  label: MessageKey;
  icon: IconName;
  tone: 'primary' | 'accent';
}[] = [
  {
    key: 'personalLife',
    label: 'prediction.personalLife',
    icon: 'favorite-border',
    tone: 'primary',
  },
  { key: 'profession', label: 'prediction.profession', icon: 'work-outline', tone: 'primary' },
  { key: 'health', label: 'prediction.health', icon: 'spa', tone: 'accent' },
  { key: 'emotions', label: 'prediction.emotions', icon: 'nightlight-round', tone: 'primary' },
  { key: 'luck', label: 'prediction.luck', icon: 'auto-awesome', tone: 'accent' },
  { key: 'travel', label: 'prediction.travel', icon: 'flight', tone: 'primary' },
];

/** One day's prediction, exactly as the provider wrote it (no generated text, FR-21). */
export function PredictionView({ prediction }: { prediction: PredictionResponse }) {
  return (
    <View style={styles.list}>
      <Card style={styles.basis}>
        <View style={styles.row}>
          <Icon name="brightness-3" color="accent" size={18} />
          <Text variant="overline" color="accent">
            {t('prediction.basis')}
          </Text>
        </View>
        <Text variant="heading">
          {prediction.moonSign} · {prediction.nakshatra}
        </Text>
        {prediction.timeAssumedNoon && (
          <Text variant="caption" color="textMuted">
            {t('chart.noonNote')}
          </Text>
        )}
      </Card>
      {SECTIONS.map((s) => (
        <Card key={s.key} style={styles.section}>
          <IconTile name={s.icon} tone={s.tone} />
          <View style={styles.flex}>
            <Text variant="subheading">{t(s.label)}</Text>
            <Text>{prediction.sections[s.key]}</Text>
          </View>
        </Card>
      ))}
      <Text variant="caption" color="textMuted" style={styles.center}>
        {t('consent.disclaimer')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  basis: { padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  section: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1, gap: spacing.xs },
  center: { textAlign: 'center', paddingVertical: spacing.sm },
});
