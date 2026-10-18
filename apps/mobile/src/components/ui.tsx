import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type StyleProp,
  type TextProps as RNTextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, spacing, typography, type ColorName, type TextVariant } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: ColorName;
}

/** Themed text. Font scaling follows the user's accessibility text size. */
export function Text({ variant = 'body', color = 'text', style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const heading = variant === 'title' || variant === 'heading';
  return (
    <RNText
      style={[typography[variant], { color: colors[color] }, style]}
      accessibilityRole={heading ? 'header' : undefined}
      {...rest}
    />
  );
}

export type IconName = ComponentProps<typeof MaterialIcons>['name'];

/** Material icon in a theme colour. Decorative by default: the text next to it carries meaning. */
export function Icon({
  name,
  size = 20,
  color = 'textMuted',
}: {
  name: IconName;
  size?: number;
  color?: ColorName;
}) {
  const { colors } = useTheme();
  return (
    <MaterialIcons
      name={name}
      size={size}
      color={colors[color]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

/** Rounded square holding an icon, as used on reading cards and list rows. */
export function IconTile({
  name,
  tone = 'primary',
}: {
  name: IconName;
  tone?: 'primary' | 'accent';
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: tone === 'primary' ? colors.primarySoft : colors.accentSoft },
      ]}
    >
      <Icon name={name} size={24} color={tone === 'primary' ? 'onPrimarySoft' : 'onAccentSoft'} />
    </View>
  );
}

/** Screen container: safe area, themed background, scrolls so large text never clips. */
export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.background }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={[styles.content, style]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** Surface card. "muted" is a quieter, borderless panel for secondary information. */
export function Card({
  children,
  style,
  tone = 'default',
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: 'default' | 'muted';
}) {
  const { colors, scheme } = useTheme();
  const muted = tone === 'muted';
  return (
    <View
      style={[
        styles.card,
        muted
          ? { backgroundColor: colors.surfaceAlt, borderColor: 'transparent' }
          : {
              backgroundColor: colors.surface,
              borderColor: colors.hairline,
              boxShadow: scheme === 'light' ? '0 1px 3px rgba(28, 28, 25, 0.06)' : undefined,
            },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Small status label, e.g. "Primary" or "Now". */
export function Tag({ label, tone = 'accent' }: { label: string; tone?: 'accent' | 'primary' }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.tag,
        { backgroundColor: tone === 'accent' ? colors.accentSoft : colors.primarySoft },
      ]}
    >
      <Text variant="caption" color={tone === 'accent' ? 'onAccentSoft' : 'onPrimarySoft'}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  tile: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});
