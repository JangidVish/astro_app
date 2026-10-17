import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Profile } from '@astro/shared';
import { Text } from '@/components/ui';
import { t } from '@/i18n/en';
import { MIN_TOUCH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { formatBirthDate, formatBirthTime, formatUtcOffset } from './format';

/** One profile in the list. The whole card is a single accessible button. */
export const ProfileCard = memo(function ProfileCard({
  profile,
  onPress,
}: {
  profile: Profile;
  onPress: (id: string) => void;
}) {
  const { colors } = useTheme();
  const when = `${formatBirthDate(profile.birthDate)}, ${
    profile.birthTime ? formatBirthTime(profile.birthTime) : t('profiles.timeUnknown')
  }`;
  const where = `${profile.place.name}, ${profile.place.countryCode}`;
  const offset = `${t('profiles.offset')}: ${formatUtcOffset(profile.utcOffsetMinutes)}`;
  const relation = t(`profile.relation.${profile.relation}`);

  return (
    <Pressable
      onPress={() => onPress(profile.id)}
      accessibilityRole="button"
      accessibilityLabel={[
        profile.name,
        relation,
        profile.isPrimary ? t('profiles.primary') : null,
        when,
        where,
      ]
        .filter(Boolean)
        .join(', ')}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: colors.border,
          backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
        },
      ]}
    >
      <View style={styles.titleRow}>
        <Text variant="subheading" style={styles.flex}>
          {profile.name}
        </Text>
        {profile.isPrimary && (
          <Text variant="caption" color="accent">
            {t('profiles.primary')}
          </Text>
        )}
      </View>
      <Text color="textMuted">{relation}</Text>
      <Text>{when}</Text>
      <Text>{where}</Text>
      <Text variant="caption" color="textMuted">
        {offset}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
