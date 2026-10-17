import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Screen, Text } from '@/components/ui';
import { formFromProfile, toUpdateInput } from '@/features/profiles/form-model';
import { useProfile, useUpdateProfile } from '@/features/profiles/hooks';
import { ProfileForm } from '@/features/profiles/profile-form';
import { t } from '@/i18n/en';

export default function EditProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile(id);
  const update = useUpdateProfile(id);

  return (
    <Screen>
      <Stack.Screen options={{ title: t('profile.edit'), headerShown: true }} />
      {profile.isPending && <ActivityIndicator accessibilityLabel={t('common.loading')} />}
      {profile.isError && <Text color="danger">{t('common.error')}</Text>}
      {profile.data && (
        <ProfileForm
          initial={formFromProfile(profile.data)}
          submitLabel={t('profile.save')}
          onSubmit={async (input) => {
            const changes = toUpdateInput(input, profile.data);
            if (Object.keys(changes).length > 0) await update.mutateAsync(changes);
            router.back();
          }}
        />
      )}
    </Screen>
  );
}
