import { router, Stack } from 'expo-router';
import { useAuth } from '@/auth/auth-context';
import { Button } from '@/components/form';
import { Screen, Text } from '@/components/ui';
import { EmailPasswordForm } from '@/features/auth/email-password-form';
import { t } from '@/i18n/en';

export default function SignUp() {
  const { service } = useAuth();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('auth.signUp.title') }} />
      <Text variant="heading">{t('auth.signUp.title')}</Text>
      <EmailPasswordForm
        mode="signUp"
        onSubmit={(email, password) => service.signUpWithEmail(email, password)}
      />
      <Button
        label={t('auth.signUp.haveAccount')}
        variant="link"
        onPress={() => router.push('/sign-in')}
      />
    </Screen>
  );
}
