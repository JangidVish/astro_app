import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert } from 'react-native';
import { Button } from '@/components/form';
import { Card, Screen, Text } from '@/components/ui';
import { formatBirthDate, formatBirthTime, formatUtcOffset } from '@/features/profiles/format';
import { useDeleteProfile, useProfile } from '@/features/profiles/hooks';
import { t } from '@/i18n/en';

/** Profile hub. Chart, dasha and prediction sections are added in T8.4-T8.6. */
export default function ProfileDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile(id);
  const remove = useDeleteProfile();

  function confirmDelete() {
    Alert.alert(t('profile.deleteConfirmTitle'), t('profile.deleteConfirmBody'), [
      { text: t('profile.cancel'), style: 'cancel' },
      {
        text: t('profile.delete'),
        style: 'destructive',
        onPress: () => {
          remove.mutate(id, { onSuccess: () => router.replace('/') });
        },
      },
    ]);
  }

  const p = profile.data;
  return (
    <Screen>
      <Stack.Screen options={{ title: p?.name ?? '', headerShown: true }} />
      {profile.isPending && <ActivityIndicator accessibilityLabel={t('common.loading')} />}
      {profile.isError && <Text color="danger">{t('common.error')}</Text>}
      {p && (
        <>
          <Card>
            <Text variant="heading">{p.name}</Text>
            <Text>
              {formatBirthDate(p.birthDate)},{' '}
              {p.birthTime ? formatBirthTime(p.birthTime) : t('profiles.timeUnknown')}
            </Text>
            <Text>
              {p.place.name}, {p.place.countryCode}
            </Text>
            <Text variant="caption" color="textMuted">
              {t('profiles.offset')}: {formatUtcOffset(p.utcOffsetMinutes)}
            </Text>
          </Card>
          <Button
            label={t('profile.edit')}
            variant="secondary"
            onPress={() => router.push(`/profiles/${id}/edit`)}
          />
          <Button
            label={t('profile.delete')}
            variant="danger"
            onPress={confirmDelete}
            loading={remove.isPending}
          />
        </>
      )}
    </Screen>
  );
}
