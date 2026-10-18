import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { BirthDate, BirthTime } from '@astro/shared';
import { Text } from '@/components/ui';
import { MIN_TOUCH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import {
  birthDateFromInput,
  birthTimeFromInput,
  dateInputValue,
  formatBirthDate,
  formatBirthTime,
  pickerDateFromWall,
  timeInputValue,
  todayInputValue,
  wallFromPickerDate,
} from './format';

type Props =
  | {
      mode: 'date';
      label: string;
      value: BirthDate | null;
      onChange: (value: BirthDate) => void;
      error?: string | null;
      testID?: string;
    }
  | {
      mode: 'time';
      label: string;
      value: BirthTime | null;
      onChange: (value: BirthTime) => void;
      error?: string | null;
      testID?: string;
    };

const MIN_DATE = new Date(Date.UTC(1900, 0, 1));

/**
 * Web build: the native picker has no web implementation, so use the browser's own date or time
 * input. Its value is converted to calendar fields directly (no Date), so the browser's time zone
 * cannot shift a birth date or time.
 */
function WebDateTimeInput(props: Props) {
  const { colors, scheme } = useTheme();
  const value = props.mode === 'date' ? dateInputValue(props.value) : timeInputValue(props.value);

  function handleChange(raw: string) {
    if (props.mode === 'date') {
      const date = birthDateFromInput(raw);
      if (date) props.onChange(date);
    } else {
      const time = birthTimeFromInput(raw);
      if (time) props.onChange(time);
    }
  }

  return (
    <input
      type={props.mode}
      value={value}
      min={props.mode === 'date' ? '1900-01-01' : undefined}
      max={props.mode === 'date' ? todayInputValue() : undefined}
      onChange={(event) => handleChange(event.currentTarget.value)}
      aria-label={props.label}
      aria-invalid={props.error ? true : undefined}
      data-testid={props.testID}
      style={{
        minHeight: MIN_TOUCH,
        boxSizing: 'border-box',
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: radius.md,
        borderColor: props.error ? colors.danger : colors.border,
        backgroundColor: colors.surface,
        color: colors.text,
        colorScheme: scheme, // the browser's picker follows the app's light or dark theme
        paddingLeft: spacing.md,
        paddingRight: spacing.md,
        fontSize: 16,
        // Inputs do not inherit the page font; use the stack react-native-web uses for Text.
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    />
  );
}

/**
 * Tappable field that opens the native date or time picker. The picker runs in UTC and its value
 * is read as wall-clock fields, so the phone's own time zone never shifts a birth date or time.
 */
export function DateTimeField(props: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const display =
    props.mode === 'date'
      ? props.value
        ? formatBirthDate(props.value)
        : null
      : props.value
        ? formatBirthTime(props.value)
        : null;
  const pickerValue =
    props.mode === 'date'
      ? pickerDateFromWall(props.value ?? { year: 1990, month: 1, day: 1 }, null)
      : pickerDateFromWall(
          { year: 2000, month: 1, day: 1 },
          props.value ?? { hour: 12, minute: 0 },
        );

  function handleChange(event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setOpen(false); // Android shows a dialog that closes itself
    if (event.type !== 'set' || !date) return;
    const wall = wallFromPickerDate(date);
    if (props.mode === 'date') props.onChange(wall.date);
    else props.onChange(wall.time);
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.field}>
        <Text variant="label">{props.label}</Text>
        <WebDateTimeInput {...props} />
        {props.error ? (
          <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
            {props.error}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.field}>
      <Text variant="label">{props.label}</Text>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`${props.label}: ${display ?? 'not set'}`}
        accessibilityHint={props.error ?? undefined}
        testID={props.testID}
        style={[
          styles.box,
          {
            borderColor: props.error ? colors.danger : colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Text color={display ? 'text' : 'textMuted'}>{display ?? '—'}</Text>
      </Pressable>
      {open && (
        <DateTimePicker
          value={pickerValue}
          mode={props.mode}
          timeZoneName="UTC"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={props.mode === 'date' ? MIN_DATE : undefined}
          maximumDate={props.mode === 'date' ? new Date() : undefined}
          onChange={handleChange}
        />
      )}
      {props.error ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          {props.error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  box: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
});
