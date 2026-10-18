import { View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { radius } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * The app's mark: a wheel of eight spokes inside a dotted orbit, in indigo and saffron.
 * Decorative; the app name next to it is the accessible text.
 */
export function AppMark({ size = 72 }: { size?: number }) {
  const { colors } = useTheme();
  const c = 50;
  const spokes = [0, 45, 90, 135].map((deg) => {
    const r = (deg * Math.PI) / 180;
    return { x: Math.cos(r) * 30, y: Math.sin(r) * 30, accent: deg % 90 !== 0 };
  });
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: radius.lg,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.hairline,
      }}
    >
      <Svg width={size * 0.78} height={size * 0.78} viewBox="0 0 100 100">
        <Circle
          cx={c}
          cy={c}
          r={44}
          fill="none"
          stroke={colors.primary}
          strokeWidth={3}
          strokeDasharray="1 5"
          strokeLinecap="round"
        />
        <Circle cx={c} cy={c} r={30} fill="none" stroke={colors.accent} strokeWidth={3} />
        {spokes.map((s, i) => (
          <Line
            key={i}
            x1={c - s.x}
            y1={c - s.y}
            x2={c + s.x}
            y2={c + s.y}
            stroke={s.accent ? colors.accent : colors.primary}
            strokeWidth={s.accent ? 1.5 : 2.5}
          />
        ))}
        <Circle cx={c} cy={c} r={5} fill={colors.primary} />
        {[0, 90, 180, 270].map((deg) => {
          const r = (deg * Math.PI) / 180;
          return (
            <Circle
              key={deg}
              cx={c + Math.cos(r) * 44}
              cy={c + Math.sin(r) * 44}
              r={3.5}
              fill={deg % 180 === 0 ? colors.primary : colors.accent}
            />
          );
        })}
      </Svg>
    </View>
  );
}
