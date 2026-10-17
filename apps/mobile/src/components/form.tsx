import { forwardRef, type ComponentRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { MIN_TOUCH, radius, spacing, typography } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { Text } from './ui';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'link' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

/** Button with a 44 pt minimum target; disabled and announced as busy while loading. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const filled = variant === 'primary' || variant === 'danger';
  const background =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : 'transparent';
  const foreground = filled ? colors.onPrimary : variant === 'link' ? colors.primary : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      testID={testID}
      accessibilityRole={variant === 'link' ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        variant !== 'link' && { borderColor: filled ? background : colors.border, borderWidth: 1 },
        { backgroundColor: background, opacity: inactive ? 0.6 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <Text variant="label" style={{ color: foreground, textAlign: 'center' }}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
}

/** Labelled input; the error is shown under the field and announced with it. */
export const TextField = forwardRef<ComponentRef<typeof TextInput>, TextFieldProps>(
  function TextField({ label, error, hint, style, ...rest }, ref) {
    const { colors } = useTheme();
    const description = error ?? hint;
    return (
      <View style={styles.field}>
        <Text variant="label">{label}</Text>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={description ?? undefined}
          accessibilityState={{ disabled: rest.editable === false }}
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            typography.body,
            {
              color: colors.text,
              backgroundColor: colors.surface,
              borderColor: error ? colors.danger : colors.border,
            },
            style,
          ]}
          {...rest}
        />
        {error ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : hint ? (
          <Text variant="caption" color="textMuted">
            {hint}
          </Text>
        ) : null}
      </View>
    );
  },
);

/** Inline error banner for form-level failures (e.g. wrong password, offline). */
export function ErrorBanner({ message }: { message: string | null }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[styles.banner, { borderColor: colors.danger, backgroundColor: colors.surface }]}
    >
      <Text color="danger">{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { gap: spacing.xs },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
});
