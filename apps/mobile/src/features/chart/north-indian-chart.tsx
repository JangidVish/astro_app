import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { G, Line, Polygon, Text as SvgText, TSpan } from 'react-native-svg';
import { GRAHAS, type ChartBody, type ChartHouse, type PlanetPosition } from '@astro/shared';
import { Text } from '@/components/ui';
import { t } from '@/i18n/en';
import { fonts, radius, spacing, type ColorName } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import {
  ABBREVIATIONS,
  chunkLines,
  describeChart,
  northIndianLayout,
  RETRO,
} from './north-indian-layout';

export interface NorthIndianChartProps {
  houses: readonly ChartHouse[];
  planets: readonly PlanetPosition[];
  /** Accessible title, e.g. "Birth chart (D1)". */
  title: string;
  /** Side length; defaults to the screen width minus margins, capped for tablets. */
  size?: number;
}

/** Traditional colour of each body on the chart (theme tokens, contrast-tested on the chart). */
export const BODY_COLOR: Record<ChartBody, ColorName> = {
  Ascendant: 'chartAscendant',
  Sun: 'grahaSun',
  Moon: 'grahaMoon',
  Mars: 'grahaMars',
  Mercury: 'grahaMercury',
  Jupiter: 'grahaJupiter',
  Venus: 'grahaVenus',
  Saturn: 'grahaSaturn',
  Rahu: 'grahaRahu',
  Ketu: 'grahaKetu',
};

/** SVG text does not inherit the app font, so the chart names Inter's faces explicitly. */
const LABEL_FONT = fonts.semibold;
const SIGN_FONT = fonts.medium;

/**
 * North Indian chart drawn with SVG from API data, in the traditional saffron style with each
 * graha in its own colour. It is exposed to screen readers as one image with a spoken summary;
 * the planet table beside it is the full accessible alternative. Colour is never the only cue:
 * every body keeps its abbreviation and retrograde bodies keep the ℞ mark.
 */
export function NorthIndianChart({ houses, planets, title, size }: NorthIndianChartProps) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  // Screen padding (2 × 16) plus the saffron panel's padding (2 × 8).
  const side = size ?? Math.min(width - 48, 480);
  const cells = useMemo(() => northIndianLayout(houses, planets, side), [houses, planets, side]);

  // Text grows with the user's text-size setting, within limits so labels still fit their cell.
  const scale = Math.min(Math.max(fontScale, 1), 1.4);
  const labelSize = Math.round((side / 26) * scale);
  const signSize = Math.round((side / 34) * scale);
  const s = side;
  const lagna = cells.find((c) => c.house === 1);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${title}. ${describeChart(houses)}`}
      testID="north-indian-chart"
      style={[styles.wrapper, { backgroundColor: colors.chartBg }]}
    >
      <Svg width={s} height={s} viewBox={`0 0 ${String(s)} ${String(s)}`}>
        <Polygon
          points={`0,0 ${String(s)},0 ${String(s)},${String(s)} 0,${String(s)}`}
          fill={colors.chartBg}
        />
        {lagna && (
          <Polygon
            points={lagna.polygon.map((p) => `${String(p.x)},${String(p.y)}`).join(' ')}
            fill={colors.chartLagna}
          />
        )}
        <Polygon
          points={`0,0 ${String(s)},0 ${String(s)},${String(s)} 0,${String(s)}`}
          fill="none"
          stroke={colors.chartLine}
          strokeWidth={2.5}
        />
        <Line x1={0} y1={0} x2={s} y2={s} stroke={colors.chartLine} strokeWidth={1.5} />
        <Line x1={s} y1={0} x2={0} y2={s} stroke={colors.chartLine} strokeWidth={1.5} />
        <Polygon
          points={`${String(s / 2)},0 ${String(s)},${String(s / 2)} ${String(s / 2)},${String(s)} 0,${String(s / 2)}`}
          fill="none"
          stroke={colors.chartLine}
          strokeWidth={1.5}
        />
        {cells.map((cell) => {
          // Diamonds (houses 1, 4, 7, 10) are roomier than the corner triangles.
          const perLine = [1, 4, 7, 10].includes(cell.house) ? 3 : 2;
          const lines = chunkLines(cell.entries, perLine);
          const lineHeight = labelSize * 1.15;
          const top = cell.labelAt.y - ((lines.length - 1) * lineHeight) / 2;
          return (
            // An SVG group: a React Native View here is a <div> inside <svg> on web, which
            // browsers do not render, leaving the chart without any labels.
            <G key={cell.house}>
              <SvgText
                x={cell.signAt.x}
                y={cell.signAt.y}
                fontSize={signSize}
                fontFamily={SIGN_FONT}
                fill={colors.chartSign}
                textAnchor="middle"
                alignmentBaseline="middle"
              >
                {String(cell.signNumber)}
              </SvgText>
              {lines.map((line, i) => (
                <SvgText
                  key={line.map((e) => e.body).join('-')}
                  x={cell.labelAt.x}
                  y={top + i * lineHeight}
                  fontSize={labelSize}
                  fontFamily={LABEL_FONT}
                  textAnchor="middle"
                  alignmentBaseline="middle"
                >
                  {line.flatMap((entry, j) => [
                    <TSpan key={entry.body} fill={colors[BODY_COLOR[entry.body]]}>
                      {`${j > 0 ? ' ' : ''}${entry.abbreviation}`}
                    </TSpan>,
                    ...(entry.retrograde
                      ? [
                          <TSpan key={`${entry.body}-retro`} fill={colors.chartRetro}>
                            {RETRO}
                          </TSpan>,
                        ]
                      : []),
                  ])}
                </SvgText>
              ))}
            </G>
          );
        })}
      </Svg>
      <ChartLegend />
    </View>
  );
}

/** Key to the colours and marks used on the chart. */
function ChartLegend() {
  const { colors } = useTheme();
  const items: { key: string; mark: string; name: string; color: ColorName }[] = [
    {
      key: 'As',
      mark: ABBREVIATIONS.Ascendant,
      name: t('chart.ascendant'),
      color: 'chartAscendant',
    },
    ...GRAHAS.map((g) => ({ key: g, mark: ABBREVIATIONS[g], name: g, color: BODY_COLOR[g] })),
    { key: 'retro', mark: RETRO, name: t('chart.legendRetrograde'), color: 'chartRetro' },
  ];
  return (
    <View style={styles.legend} testID="chart-legend">
      {items.map((item) => (
        <View key={item.key} style={[styles.legendItem, { backgroundColor: colors.surface }]}>
          <Text variant="label" color={item.color}>
            {item.mark}
          </Text>
          <Text variant="caption" color="textMuted">
            {item.name}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, padding: spacing.sm },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});
