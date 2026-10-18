import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import type { Profile } from '@astro/shared';
import { Button } from '@/components/form';
import { Card, Icon, IconTile, Screen, Tag, Text, type IconName } from '@/components/ui';
import { useChart, useDasha } from '@/features/chart/hooks';
import { formatBirthDate, formatBirthTime, formatUtcOffset } from '@/features/profiles/format';
import { useDeleteProfile, useProfile } from '@/features/profiles/hooks';
import { Avatar } from '@/features/profiles/profile-card';
import { t } from '@/i18n/en';
import { MIN_TOUCH, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Ascendant and Moon sign tiles, from the (cached) D1 chart. Needs the birth time. */
function SignTiles({ profileId }: { profileId: string }) {
  const chart = useChart(profileId, 'D1');
  const ascendant = chart.data?.planets.find((p) => p.body === 'Ascendant')?.sign;
  const moon = chart.data?.planets.find((p) => p.body === 'Moon')?.sign;
  return (
    <View style={styles.tiles}>
      <SignTile label={t('chart.ascendant')} value={ascendant} loading={chart.isPending} />
      <SignTile label={t('profile.moonSign')} value={moon} loading={chart.isPending} />
    </View>
  );
}

function SignTile({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | undefined;
  loading: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: colors.surfaceAlt }]}>
      <Text variant="caption" color="textMuted">
        {label}
      </Text>
      {loading ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      ) : (
        <Text variant="subheading" color="primary">
          {value ?? '—'}
        </Text>
      )}
    </View>
  );
}

/** "Current dasha: Moon · Saturn", from the (cached) dasha timeline. */
function CurrentDasha({ profileId }: { profileId: string }) {
  const dasha = useDasha(profileId);
  const current = dasha.data?.current;
  if (!current) return null;
  return (
    <Card tone="muted" style={styles.dasha}>
      <Icon name="hourglass-bottom" color="accent" />
      <Text style={styles.flex}>
        {t('profile.currentDasha')}:{' '}
        <Text variant="label" color="primary">
          {current.antardasha ? `${current.mahadasha} · ${current.antardasha}` : current.mahadasha}
        </Text>
      </Text>
      <Tag label={t('dasha.now')} />
    </Card>
  );
}

function Header({ profile }: { profile: Profile }) {
  const when = `${formatBirthDate(profile.birthDate)}, ${
    profile.birthTime ? formatBirthTime(profile.birthTime) : t('profiles.timeUnknown')
  }`;
  return (
    <Card style={styles.header}>
      <View style={styles.identity}>
        <Avatar profile={profile} size={60} />
        <View style={styles.flex}>
          <Text variant="heading">{profile.name}</Text>
          <View style={styles.tags}>
            <Tag label={t(`profile.relation.${profile.relation}`)} tone="primary" />
            {profile.isPrimary && <Tag label={t('profiles.primary')} />}
          </View>
        </View>
      </View>
      {profile.timeKnown && <SignTiles profileId={profile.id} />}
      <View style={styles.facts}>
        <Fact icon="event" label={t('profiles.dateTime')} value={when} />
        <Fact
          icon="place"
          label={t('profiles.birthplace')}
          value={`${profile.place.name}, ${profile.place.countryCode}`}
        />
        <Fact
          icon="schedule"
          label={t('profiles.offset')}
          value={formatUtcOffset(profile.utcOffsetMinutes)}
        />
      </View>
    </Card>
  );
}

function Fact({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={18} />
      <Text color="textMuted" style={styles.factLabel}>
        {label}
      </Text>
      <Text variant="label" style={styles.factValue}>
        {value}
      </Text>
    </View>
  );
}

function ReadingCard({
  icon,
  tone,
  title,
  tag,
  body,
  onPress,
}: {
  icon: IconName;
  tone: 'primary' | 'accent';
  title: string;
  tag: string;
  body: string;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
      style={({ pressed }) => [
        styles.reading,
        {
          backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
          borderColor: colors.hairline,
          boxShadow: scheme === 'light' ? '0 1px 3px rgba(28, 28, 25, 0.06)' : undefined,
        },
      ]}
    >
      <IconTile name={icon} tone={tone} />
      <View style={styles.flex}>
        <View style={styles.tags}>
          <Text variant="subheading">{title}</Text>
          <Tag label={tag} tone={tone} />
        </View>
        <Text color="textMuted">{body}</Text>
      </View>
      <Icon name="chevron-right" />
    </Pressable>
  );
}

/** Profile hub: who, when and where, then the three readings. */
export default function ProfileDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile(id);
  const remove = useDeleteProfile();
  // Confirmation lives in the page (system alerts do nothing on the web build).
  const [confirming, setConfirming] = useState(false);
  const p = profile.data;

  return (
    <Screen>
      <Stack.Screen options={{ title: p?.name ?? '', headerShown: true }} />
      {profile.isPending && <ActivityIndicator accessibilityLabel={t('common.loading')} />}
      {profile.isError && <Text color="danger">{t('common.error')}</Text>}
      {p && (
        <>
          <Header profile={p} />
          {p.timeKnown && <CurrentDasha profileId={p.id} />}

          <Text variant="heading">{t('profile.readings')}</Text>
          <ReadingCard
            icon="wb-sunny"
            tone="accent"
            title={t('prediction.title')}
            tag={t('prediction.today')}
            body={t('profile.predictionCardBody')}
            onPress={() => router.push(`/profiles/${id}/prediction`)}
          />
          <ReadingCard
            icon="grid-view"
            tone="primary"
            title={t('chart.title')}
            tag={t('profile.chartCardTag')}
            body={t('profile.chartCardBody')}
            onPress={() => router.push(`/profiles/${id}/chart`)}
          />
          <ReadingCard
            icon="all-inclusive"
            tone="primary"
            title={t('dasha.title')}
            tag={t('profile.dashaCardTag')}
            body={t('profile.dashaCardBody')}
            onPress={() => router.push(`/profiles/${id}/dasha`)}
          />

          <Button
            label={t('profile.edit')}
            variant="secondary"
            icon="edit"
            onPress={() => router.push(`/profiles/${id}/edit`)}
          />
          {confirming ? (
            <Card style={styles.confirm}>
              <Text variant="subheading">{t('profile.deleteConfirmTitle')}</Text>
              <Text>{t('profile.deleteConfirmBody')}</Text>
              <Button
                label={t('profile.delete')}
                variant="danger"
                icon="delete-outline"
                loading={remove.isPending}
                onPress={() => {
                  remove.mutate(id, { onSuccess: () => router.replace('/') });
                }}
              />
              <Button
                label={t('profile.cancel')}
                variant="secondary"
                onPress={() => setConfirming(false)}
              />
            </Card>
          ) : (
            <Button
              label={t('profile.delete')}
              variant="dangerSoft"
              icon="delete-outline"
              onPress={() => setConfirming(true)}
            />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: spacing.md, padding: spacing.lg },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: 130,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  facts: { gap: spacing.sm },
  fact: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.sm },
  factLabel: { flexGrow: 1 },
  factValue: { flexShrink: 1, textAlign: 'right' },
  dasha: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reading: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  confirm: { gap: spacing.md },
});
