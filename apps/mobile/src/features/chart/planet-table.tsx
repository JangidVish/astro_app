import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PlanetPosition } from '@astro/shared';
import { Text } from '@/components/ui';
import { t } from '@/i18n/en';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** 12.1895 -> "12°11′" (degrees and arc-minutes, as astrologers read positions). */
export function formatDegree(degree: number | null): string {
  if (degree === null) return '—';
  const whole = Math.floor(degree);
  const minutes = Math.floor((degree - whole) * 60);
  return `${String(whole)}°${String(minutes).padStart(2, '0')}′`;
}

const Row = memo(function Row({ planet }: { planet: PlanetPosition }) {
  const { colors } = useTheme();
  const name = planet.body === 'Ascendant' ? t('chart.ascendant') : planet.body;
  const retro = planet.isRetrograde && planet.body !== 'Rahu' && planet.body !== 'Ketu';
  const nakshatra = planet.nakshatraPada
    ? `${planet.nakshatra} ${String(planet.nakshatraPada)}`
    : planet.nakshatra;
  const spoken = [
    name,
    `${planet.sign} ${planet.degreeInSign === null ? '' : formatDegree(planet.degreeInSign)}`.trim(),
    nakshatra,
    planet.house ? `${t('chart.house')} ${String(planet.house)}` : null,
    retro ? t('chart.retrograde') : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <View
      accessible
      accessibilityLabel={spoken}
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <Text variant="label" style={styles.name}>
        {name}
        {retro ? ' ℞' : ''}
      </Text>
      <Text style={styles.cell}>
        {planet.sign} {formatDegree(planet.degreeInSign)}
      </Text>
      <Text style={styles.cell} color="textMuted">
        {nakshatra}
      </Text>
      <Text style={styles.house}>{planet.house ?? '—'}</Text>
    </View>
  );
});

/** The accessible, text alternative to the chart drawing (one row per body). */
export function PlanetTable({ planets }: { planets: readonly PlanetPosition[] }) {
  return (
    <View accessibilityRole="list" accessibilityLabel={t('chart.planets')}>
      <View
        style={styles.row}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        <Text variant="caption" color="textMuted" style={styles.name}>
          {t('chart.body')}
        </Text>
        <Text variant="caption" color="textMuted" style={styles.cell}>
          {t('chart.sign')}
        </Text>
        <Text variant="caption" color="textMuted" style={styles.cell}>
          {t('chart.nakshatra')}
        </Text>
        <Text variant="caption" color="textMuted" style={styles.house}>
          {t('chart.house')}
        </Text>
      </View>
      {planets.map((p) => (
        <Row key={p.body} planet={p} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { flexBasis: 92, flexGrow: 0 },
  cell: { flex: 1, minWidth: 96 },
  house: { width: 40, textAlign: 'right' },
});
