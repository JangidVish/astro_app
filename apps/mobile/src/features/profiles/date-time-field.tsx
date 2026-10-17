import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { BirthDate, BirthTime } from '@astro/shared';
import { Text } from '@/components/ui';
import { MIN_TOUCH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { formatBirthDate, formatBirthTime, pickerDateFromWall, wallFromPickerDate } from './format';

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
