import { router, Stack } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { MAX_PROFILES_PER_USER } from '@astro/shared';
import { AppMark } from '@/components/app-mark';
import { Button } from '@/components/form';
import { Card, Icon, Screen, Text } from '@/components/ui';
import { useProfiles } from '@/features/profiles/hooks';
import { ProfileCard } from '@/features/profiles/profile-card';
import { t, tf } from '@/i18n/en';
import { MIN_TOUCH, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

function SettingsButton() {
  return (
    <Pressable
      onPress={() => router.push('/settings')}
      accessibilityRole="button"
      accessibilityLabel={t('settings.title')}
      hitSlop={8}
      style={styles.headerButton}
    >
      <Icon name="settings" color="primary" size={24} />
    </Pressable>
  );
}

/** Home: the user's birth profiles. */
export default function Profiles() {
  const { colors } = useTheme();
  const profiles = useProfiles();
  const openProfile = useCallback((id: string) => router.push(`/profiles/${id}`), []);
  const list = profiles.data?.profiles ?? [];
  const atLimit = list.length >= MAX_PROFILES_PER_USER;

  return (
    <Screen>
      <Stack.Screen
        options={{
          title: t('profiles.title'),
          headerShown: true,
          headerRight: () => <SettingsButton />,
        }}
      />
      {profiles.isPending && <ActivityIndicator accessibilityLabel={t('common.loading')} />}
      {profiles.isError && (
        <Card>
          <Text color="danger">{t('common.offline')}</Text>
          <Button
            label={t('common.retry')}
            variant="secondary"
            icon="refresh"
            onPress={() => void profiles.refetch()}
          />
        </Card>
      )}
      {profiles.isSuccess && list.length === 0 && (
        <View style={styles.empty}>
          <AppMark size={96} />
          <Text variant="heading" style={styles.center}>
            {t('profiles.emptyTitle')}
          </Text>
          <Text color="textMuted" style={styles.center}>
            {t('profiles.empty')}
          </Text>
        </View>
      )}
      {list.length > 0 && (
        <View style={styles.status}>
          <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          <Text variant="caption" color="textMuted">
            {tf('profiles.count', { count: list.length, max: MAX_PROFILES_PER_USER })}
          </Text>
        </View>
      )}
      {list.map((p) => (
        <ProfileCard key={p.id} profile={p} onPress={openProfile} />
      ))}
      {profiles.isSuccess && (
        <>
          <Button
            label={t('profiles.add')}
            icon="person-add-alt"
            onPress={() => router.push('/profiles/new')}
            disabled={atLimit}
            accessibilityHint={atLimit ? t('profiles.limit') : undefined}
            testID="add-profile"
          />
          {atLimit && (
            <Text color="textMuted" style={styles.center}>
              {t('profiles.limit')}
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  center: { textAlign: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
