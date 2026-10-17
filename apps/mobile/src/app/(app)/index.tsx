import { router, Stack } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator } from 'react-native';
import { MAX_PROFILES_PER_USER } from '@astro/shared';
import { Button } from '@/components/form';
import { Card, Screen, Text } from '@/components/ui';
import { useProfiles } from '@/features/profiles/hooks';
import { ProfileCard } from '@/features/profiles/profile-card';
import { t } from '@/i18n/en';

/** Home: the user's birth profiles. */
export default function Profiles() {
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
          headerRight: () => (
            <Button
              label={t('settings.title')}
              variant="link"
              onPress={() => router.push('/settings')}
            />
          ),
        }}
      />
      {profiles.isPending && <ActivityIndicator accessibilityLabel={t('common.loading')} />}
      {profiles.isError && (
        <Card>
          <Text color="danger">{t('common.offline')}</Text>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void profiles.refetch()}
          />
        </Card>
      )}
      {profiles.isSuccess && list.length === 0 && (
        <Text color="textMuted">{t('profiles.empty')}</Text>
      )}
      {list.map((p) => (
        <ProfileCard key={p.id} profile={p} onPress={openProfile} />
      ))}
      {profiles.isSuccess && (
        <>
          <Button
            label={t('profiles.add')}
            onPress={() => router.push('/profiles/new')}
            disabled={atLimit}
            accessibilityHint={atLimit ? t('profiles.limit') : undefined}
            testID="add-profile"
          />
          {atLimit && <Text color="textMuted">{t('profiles.limit')}</Text>}
        </>
      )}
    </Screen>
  );
}
