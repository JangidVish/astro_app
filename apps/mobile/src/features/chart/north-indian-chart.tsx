import { useMemo } from 'react';
import { Platform, useWindowDimensions, View } from 'react-native';
import Svg, { G, Line, Polygon, Text as SvgText } from 'react-native-svg';
import type { ChartHouse, PlanetPosition } from '@astro/shared';
import { useTheme } from '@/theme/use-theme';
import { describeChart, northIndianLayout, wrapLabels } from './north-indian-layout';

export interface NorthIndianChartProps {
  houses: readonly ChartHouse[];
  planets: readonly PlanetPosition[];
  /** Accessible title, e.g. "Birth chart (D1)". */
  title: string;
  /** Side length; defaults to the screen width minus margins, capped for tablets. */
  size?: number;
}

/**
 * North Indian chart drawn with SVG from API data. It is exposed to screen readers as one image
 * with a spoken summary; the planet table beside it is the full accessible alternative.
 */
/** SVG text does not inherit the page font on web; use the stack react-native-web uses for Text. */
const FONT_FAMILY =
  Platform.OS === 'web'
    ? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    : undefined;

export function NorthIndianChart({ houses, planets, title, size }: NorthIndianChartProps) {
  const { colors } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const side = size ?? Math.min(width - 32, 480);
  const cells = useMemo(() => northIndianLayout(houses, planets, side), [houses, planets, side]);

  // Text grows with the user's text-size setting, within limits so labels still fit their cell.
  const scale = Math.min(Math.max(fontScale, 1), 1.4);
  const labelSize = Math.round((side / 26) * scale);
  const signSize = Math.round((side / 34) * scale);
  const s = side;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${title}. ${describeChart(houses)}`}
      testID="north-indian-chart"
    >
      <Svg width={s} height={s} viewBox={`0 0 ${String(s)} ${String(s)}`}>
        <Polygon
          points={`0,0 ${String(s)},0 ${String(s)},${String(s)} 0,${String(s)}`}
          fill={colors.surface}
          stroke={colors.chartLine}
          strokeWidth={2}
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
          const lines = wrapLabels(cell.labels, perLine);
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
                fontFamily={FONT_FAMILY}
                fill={colors.textMuted}
                textAnchor="middle"
                alignmentBaseline="middle"
              >
                {String(cell.signNumber)}
              </SvgText>
              {lines.map((line, i) => (
                <SvgText
                  key={line}
                  x={cell.labelAt.x}
                  y={top + i * lineHeight}
                  fontSize={labelSize}
                  fontFamily={FONT_FAMILY}
                  fontWeight="600"
                  fill={
                    line.startsWith('As') && i === 0 && cell.house === 1
                      ? colors.accent
                      : colors.text
                  }
                  textAnchor="middle"
                  alignmentBaseline="middle"
                >
                  {line}
                </SvgText>
              ))}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
