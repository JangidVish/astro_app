import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { PlanetPosition } from '@astro/shared';
import { Card, Text } from '@/components/ui';
import { t } from '@/i18n/en';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { BODY_COLOR } from './north-indian-chart';
import { ABBREVIATIONS } from './north-indian-layout';

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
      style={[styles.row, { borderBottomColor: colors.hairline }]}
    >
      <View style={styles.name}>
        <View style={[styles.badge, { backgroundColor: colors.chartBg }]}>
          <Text variant="caption" style={{ color: colors[BODY_COLOR[planet.body]] }}>
            {ABBREVIATIONS[planet.body]}
          </Text>
        </View>
        <Text variant="label" style={styles.shrink}>
          {name}
          {retro ? (
            <Text variant="label" color="chartRetro">
              {' ℞'}
            </Text>
          ) : null}
        </Text>
      </View>
      <View style={styles.cell}>
        <Text>{planet.sign}</Text>
        <Text variant="caption" color="textMuted">
          {formatDegree(planet.degreeInSign)}
        </Text>
      </View>
      <Text style={styles.cell} color="textMuted">
        {nakshatra}
      </Text>
      <Text variant="label" color="primary" style={styles.house}>
        {planet.house ? `H${String(planet.house)}` : '—'}
      </Text>
    </View>
  );
});

/** The accessible, text alternative to the chart drawing (one row per body). */
export function PlanetTable({ planets }: { planets: readonly PlanetPosition[] }) {
  return (
    <Card style={styles.table}>
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
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  table: { paddingVertical: spacing.xs, gap: 0 },
  name: { flexBasis: 100, flexGrow: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    minWidth: 30,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignItems: 'center',
  },
  shrink: { flexShrink: 1 },
  // Columns shrink and their text wraps, so the row never breaks across lines.
  cell: { flex: 1, minWidth: 0 },
  house: { width: 44, textAlign: 'right' },
});
