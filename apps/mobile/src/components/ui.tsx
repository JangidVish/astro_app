import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  type TextProps as RNTextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts, spacing, typography, type ColorName, type TextVariant } from '@/theme/tokens';
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
      style={[
        typography[variant],
        { color: colors[color], fontFamily: heading ? fonts?.heading : fonts?.body },
        style,
      ]}
      accessibilityRole={heading ? 'header' : undefined}
      {...rest}
    />
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

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
