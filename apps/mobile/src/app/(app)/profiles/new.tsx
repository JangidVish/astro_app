import { router, Stack } from 'expo-router';
import { Screen } from '@/components/ui';
import { emptyForm } from '@/features/profiles/form-model';
import { useCreateProfile } from '@/features/profiles/hooks';
import { ProfileForm } from '@/features/profiles/profile-form';
import { t } from '@/i18n/en';

export default function NewProfile() {
  const create = useCreateProfile();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('profile.new'), headerShown: true }} />
      <ProfileForm
        initial={emptyForm}
        submitLabel={t('profile.save')}
        onSubmit={async (input) => {
          const profile = await create.mutateAsync(input);
          router.replace(`/profiles/${profile.id}`);
        }}
      />
    </Screen>
  );
}
