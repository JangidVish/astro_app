import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { RELATIONS, type ProfileCreateInput, type Relation } from '@astro/shared';
import { Button, Chip, ErrorBanner, TextField } from '@/components/form';
import { Card, Icon, Text } from '@/components/ui';
import { t, type MessageKey } from '@/i18n/en';
import { ApiError } from '@/lib/api-client';
import { MIN_TOUCH, spacing } from '@/theme/tokens';
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

export function ProfileForm({ initial, submitLabel, onSubmit }: ProfileFormProps) {
  const { colors } = useTheme();
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

      <Card>
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text variant="label">{t('profile.timeKnown')}</Text>
            <Text variant="caption" color="textMuted">
              {t('profile.timeKnownHint')}
            </Text>
          </View>
          <Switch
            value={form.timeKnown}
            onValueChange={(timeKnown) => set({ timeKnown, offsetChoice: null })}
            trackColor={{ true: colors.primary, false: colors.border }}
            thumbColor={colors.surface}
            // react-native-web colours the "on" thumb with its own prop.
            {...{ activeThumbColor: colors.surface }}
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
      </Card>

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
        <View style={styles.preview}>
          <Icon name="schedule" color="accent" size={18} />
          <Text color="textMuted" testID="offset-preview" style={styles.flex}>
            {t('profile.offsetPreview')}: {formatUtcOffset(check.utcOffsetMinutes)}
          </Text>
        </View>
      )}

      <Button
        label={submitLabel}
        icon="check"
        onPress={() => void submit()}
        loading={saving}
        testID="save"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  group: { gap: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH },
  preview: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
