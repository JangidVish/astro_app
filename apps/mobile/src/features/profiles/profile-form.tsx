import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { RELATIONS, type ProfileCreateInput, type Relation } from '@astro/shared';
import { Button, ErrorBanner, TextField } from '@/components/form';
import { Card, Text } from '@/components/ui';
import { t, type MessageKey } from '@/i18n/en';
import { ApiError } from '@/lib/api-client';
import { MIN_TOUCH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { DateTimeField } from './date-time-field';
import { formatUtcOffset } from './format';
import {
  checkBirth,
  fieldErrorsFromDetails,
  toCreateInput,
  type FieldErrors,
  type ProfileFormState,
} from './form-model';
import { PlaceSearch } from './place-search';

export interface ProfileFormProps {
  initial: ProfileFormState;
  submitLabel: string;
  onSubmit: (input: ProfileCreateInput) => Promise<unknown>;
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.primary : colors.surface,
        },
      ]}
    >
      <Text variant="label" style={{ color: selected ? colors.onPrimary : colors.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ProfileForm({ initial, submitLabel, onSubmit }: ProfileFormProps) {
  const [form, setForm] = useState<ProfileFormState>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<MessageKey | null>(null);
  const [saving, setSaving] = useState(false);
  const check = checkBirth(form);
  const set = (patch: Partial<ProfileFormState>) => setForm((f) => ({ ...f, ...patch }));
  const err = (field: keyof FieldErrors) => (errors[field] ? t(errors[field]) : null);

  async function submit() {
    const result = toCreateInput(form);
    if ('errors' in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      await onSubmit(result.input);
    } catch (error) {
      if (error instanceof ApiError && error.details.length > 0) {
        setErrors(fieldErrorsFromDetails(error.details));
      } else if (error instanceof ApiError && error.code === 'PROFILE_LIMIT_REACHED') {
        setFormError('profile.error.limit');
      } else if (
        error instanceof ApiError &&
        (error.code === 'NETWORK' || error.code === 'TIMEOUT')
      ) {
        setFormError('common.offline');
      } else {
        setFormError('common.error');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.form}>
      <ErrorBanner message={formError ? t(formError) : null} />
      <TextField
        label={t('profile.name')}
        value={form.name}
        onChangeText={(name) => set({ name })}
        error={err('name')}
        autoComplete="name"
        testID="name"
      />

      <View
        style={styles.group}
        accessibilityRole="radiogroup"
        accessibilityLabel={t('profile.relation')}
      >
        <Text variant="label">{t('profile.relation')}</Text>
        <View style={styles.chips}>
          {RELATIONS.map((r: Relation) => (
            <Chip
              key={r}
              label={t(`profile.relation.${r}`)}
              selected={form.relation === r}
              onPress={() => set({ relation: r })}
            />
          ))}
        </View>
      </View>

      <DateTimeField
        mode="date"
        label={t('profile.birthDate')}
        value={form.birthDate}
        onChange={(birthDate) => set({ birthDate, offsetChoice: null })}
        error={err('birthDate')}
        testID="birth-date"
      />

      <View style={styles.switchRow}>
        <Text style={styles.flex}>{t('profile.timeKnown')}</Text>
        <Switch
          value={form.timeKnown}
          onValueChange={(timeKnown) => set({ timeKnown, offsetChoice: null })}
          accessibilityLabel={t('profile.timeKnown')}
          testID="time-known"
        />
      </View>
      {form.timeKnown ? (
        <DateTimeField
          mode="time"
          label={t('profile.birthTime')}
          value={form.birthTime}
          onChange={(birthTime) => set({ birthTime, offsetChoice: null })}
          error={err('birthTime')}
          testID="birth-time"
        />
      ) : (
        <Text color="textMuted">{t('profile.timeUnknownNote')}</Text>
      )}

      <PlaceSearch
        value={form.place}
        onChange={(place) => set({ place, offsetChoice: null })}
        error={err('place')}
      />

      {check.kind === 'ambiguous' && (
        <Card>
          <Text variant="subheading">{t('profile.ambiguous.title')}</Text>
          <Text>{t('profile.ambiguous.body')}</Text>
          <View style={styles.chips} accessibilityRole="radiogroup">
            <Chip
              label={`${t('profile.ambiguous.first')} (${formatUtcOffset(check.offsets[0])})`}
              selected={form.offsetChoice === 'earlier'}
              onPress={() => set({ offsetChoice: 'earlier' })}
            />
            <Chip
              label={`${t('profile.ambiguous.second')} (${formatUtcOffset(check.offsets[1])})`}
              selected={form.offsetChoice === 'later'}
              onPress={() => set({ offsetChoice: 'later' })}
            />
          </View>
          {err('offsetChoice') && <Text color="danger">{err('offsetChoice')}</Text>}
        </Card>
      )}
      {check.kind === 'gap' && (
        <Text color="danger" accessibilityLiveRegion="polite">
          {t('profile.error.gap')}
        </Text>
      )}
      {check.kind === 'future' && (
        <Text color="danger" accessibilityLiveRegion="polite">
          {t('profile.error.future')}
        </Text>
      )}
      {check.kind === 'ok' && (
        <Text color="textMuted" testID="offset-preview">
          {t('profile.offsetPreview')}: {formatUtcOffset(check.utcOffsetMinutes)}
        </Text>
      )}

      <Button label={submitLabel} onPress={() => void submit()} loading={saving} testID="save" />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  group: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH },
  flex: { flex: 1 },
});
