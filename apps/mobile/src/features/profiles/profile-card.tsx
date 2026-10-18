import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Profile } from '@astro/shared';
import { Icon, Tag, Text, type IconName } from '@/components/ui';
import { t } from '@/i18n/en';
import { MIN_TOUCH, radius, spacing, type ColorName } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { formatBirthDate, formatBirthTime, formatUtcOffset } from './format';

/** "Asha Rao" -> "AR"; one letter for single names. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

/** Round initials badge. The primary profile is filled; others alternate soft tones. */
export function Avatar({ profile, size = 52 }: { profile: Profile; size?: number }) {
  const { colors } = useTheme();
  const soft = profile.relation === 'partner' || profile.relation === 'friend';
  const [bg, fg]: [ColorName, ColorName] = profile.isPrimary
    ? ['primary', 'onPrimary']
    : soft
      ? ['accentSoft', 'onAccentSoft']
      : ['primarySoft', 'onPrimarySoft'];
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colors[bg] },
      ]}
    >
      <Text variant="subheading" color={fg}>
        {initialsOf(profile.name)}
      </Text>
    </View>
  );
}

function Detail({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Icon name={icon} color="accent" size={18} />
      <View style={styles.flex}>
        <Text variant="caption" color="textMuted">
          {label}
        </Text>
        <Text variant="label">{value}</Text>
      </View>
    </View>
  );
}

/** One profile in the list. The whole card is a single accessible button. */
export const ProfileCard = memo(function ProfileCard({
  profile,
  onPress,
}: {
  profile: Profile;
  onPress: (id: string) => void;
}) {
  const { colors, scheme } = useTheme();
  const when = `${formatBirthDate(profile.birthDate)}, ${
    profile.birthTime ? formatBirthTime(profile.birthTime) : t('profiles.timeUnknown')
  }`;
  const where = `${profile.place.name}, ${profile.place.countryCode}`;
  const offset = formatUtcOffset(profile.utcOffsetMinutes);
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
          borderColor: colors.hairline,
          backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
          boxShadow: scheme === 'light' ? '0 1px 3px rgba(28, 28, 25, 0.06)' : undefined,
        },
      ]}
    >
      <View style={styles.header}>
        <Avatar profile={profile} />
        <View style={styles.flex}>
          <View style={styles.titleRow}>
            <Text variant="subheading" style={styles.shrink}>
              {profile.name}
            </Text>
            {profile.isPrimary && <Tag label={t('profiles.primary')} />}
          </View>
          <Text color="textMuted">{relation}</Text>
        </View>
        <Icon name="chevron-right" />
      </View>
      <View style={[styles.panel, { backgroundColor: colors.surfaceAlt }]}>
        <Detail icon="event" label={t('profiles.dateTime')} value={when} />
        <Detail icon="place" label={t('profiles.birthplace')} value={where} />
        <Detail icon="schedule" label={t('profiles.offset')} value={offset} />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    minHeight: MIN_TOUCH,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.md,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  // Details wrap onto more lines rather than being cut off, even with large text.
  panel: {
    borderRadius: radius.md,
    padding: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
    columnGap: spacing.lg,
  },
  detail: { flexDirection: 'row', gap: spacing.sm, flexGrow: 1, flexBasis: 120 },
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
});
