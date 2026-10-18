import { forwardRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
} from 'react-native';
import { t } from '@/i18n/en';
import { MIN_TOUCH, radius, spacing, typography, type ColorName } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { Icon, Text, type IconName } from './ui';

export type ButtonVariant = 'primary' | 'secondary' | 'link' | 'danger' | 'dangerSoft';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** Leading icon; decorative, the label stays the accessible name. */
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

/**
 * Web only: the browser's own focus ring sits inside our field. Focus is shown on the whole field
 * instead (indigo border). React Native's types do not list "none", but react-native-web accepts it.
 */
const NO_BROWSER_OUTLINE = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle;

const BUTTON_COLORS: Record<ButtonVariant, { bg: ColorName | null; fg: ColorName }> = {
  primary: { bg: 'primary', fg: 'onPrimary' },
  secondary: { bg: 'surfaceAlt', fg: 'primary' },
  link: { bg: null, fg: 'primary' },
  danger: { bg: 'danger', fg: 'onDanger' },
  dangerSoft: { bg: 'dangerSoft', fg: 'onDangerSoft' },
};

/** Button with a 44 pt minimum target; disabled and announced as busy while loading. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const { colors } = useTheme();
  const inactive = disabled || loading;
  const { bg, fg: foreground } = BUTTON_COLORS[variant];

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
        variant === 'link' && styles.link,
        {
          backgroundColor: bg ? colors[bg] : 'transparent',
          opacity: inactive ? 0.55 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[foreground]} />
      ) : (
        <View style={styles.buttonContent}>
          {icon ? <Icon name={icon} color={foreground} /> : null}
          <Text variant="label" color={foreground} style={styles.centered}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
  /** Icon at the end of the field (decorative). */
  icon?: IconName;
  /** For password fields: adds a button that shows or hides what was typed. */
  revealable?: boolean;
}

/** Labelled, filled input; the error is shown under the field and announced with it. */
export const TextField = forwardRef<ComponentRef<typeof TextInput>, TextFieldProps>(
  function TextField(
    { label, error, hint, icon, revealable, style, onFocus, onBlur, ...rest },
    ref,
  ) {
    const { colors } = useTheme();
    const [revealed, setRevealed] = useState(false);
    const [focused, setFocused] = useState(false);
    const description = error ?? hint;
    const secure = rest.secureTextEntry === true && !revealed;
    return (
      <View style={styles.field}>
        <Text variant="label">{label}</Text>
        <View
          style={[
            styles.inputBox,
            {
              backgroundColor: colors.surfaceAlt,
              // Kept visible (3:1) so the field is recognisable as an input (WCAG 1.4.11).
              // Focus is shown on the whole field (the browser's inner outline is turned off).
              borderColor: error ? colors.danger : focused ? colors.primary : colors.border,
              borderWidth: focused ? 2 : 1,
              paddingHorizontal: focused ? spacing.md - 1 : spacing.md,
            },
          ]}
        >
          <TextInput
            ref={ref}
            accessibilityLabel={label}
            accessibilityHint={description ?? undefined}
            accessibilityState={{ disabled: rest.editable === false }}
            placeholderTextColor={colors.textMuted}
            style={[
              styles.input,
              NO_BROWSER_OUTLINE,
              typography.body,
              { color: colors.text },
              style,
            ]}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            {...rest}
            secureTextEntry={secure}
          />
          {revealable ? (
            <Pressable
              onPress={() => setRevealed((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel={t(revealed ? 'auth.hidePassword' : 'auth.showPassword')}
              hitSlop={8}
              style={styles.reveal}
            >
              <Icon name={revealed ? 'visibility-off' : 'visibility'} />
            </Pressable>
          ) : icon ? (
            <Icon name={icon} />
          ) : null}
        </View>
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
      style={[styles.banner, { backgroundColor: colors.dangerSoft }]}
    >
      <Icon name="error-outline" color="onDangerSoft" />
      <Text color="onDangerSoft" style={styles.flex}>
        {message}
      </Text>
    </View>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: IconName;
}

/** Segmented tabs (e.g. D1 / D9, Yesterday / Today / Tomorrow). */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.segments, { backgroundColor: colors.surfaceAlt }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            style={[
              styles.segment,
              selected && {
                backgroundColor: colors.surface,
                borderColor: colors.primary,
              },
            ]}
          >
            <View style={styles.buttonContent}>
              {option.icon ? (
                <Icon name={option.icon} size={18} color={selected ? 'primary' : 'textMuted'} />
              ) : null}
              <Text
                variant="label"
                color={selected ? 'primary' : 'textMuted'}
                style={styles.centered}
              >
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Single-choice pill (e.g. relation). Exposed as a radio button. */
export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      testID={testID}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text variant="label" color={selected ? 'onPrimary' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A muted prompt followed by an accent link, e.g. "New here? Create an account". One tap target
 * whose accessible name is the whole sentence.
 */
export function InlineLink({
  prompt,
  action,
  onPress,
}: {
  prompt: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${prompt} ${action}`}
      style={({ pressed }) => [styles.inlineLink, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Text color="textMuted" style={styles.centered}>
        {prompt}{' '}
        <Text variant="label" color="accent">
          {action}
        </Text>
      </Text>
    </Pressable>
  );
}

/** Horizontal rule with a word in the middle, e.g. "or". */
export function Divider({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.divider} accessibilityRole="text">
      <View style={[styles.rule, { backgroundColor: colors.hairline }]} />
      <Text variant="overline" color="textMuted">
        {label}
      </Text>
      <View style={[styles.rule, { backgroundColor: colors.hairline }]} />
    </View>
  );
}

/** A labelled group of controls. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text variant="label">{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  button: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.sm },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  centered: { textAlign: 'center', flexShrink: 1 },
  field: { gap: spacing.xs },
  inputBox: {
    minHeight: MIN_TOUCH + 4,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: { flex: 1, minHeight: MIN_TOUCH, paddingVertical: spacing.sm },
  banner: {
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  segments: { flexDirection: 'row', borderRadius: radius.md, padding: 4, gap: 4 },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  reveal: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -spacing.sm,
  },
  inlineLink: { minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rule: { flex: 1, height: 1 },
  chip: {
    minHeight: MIN_TOUCH,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
