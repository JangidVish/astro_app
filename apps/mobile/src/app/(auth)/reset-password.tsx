import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { messageFor } from '@/auth/messages';
import { validateEmail } from '@/auth/validation';
import { Button, ErrorBanner, TextField } from '@/components/form';
import { Card, Screen, Text } from '@/components/ui';
import { t } from '@/i18n/en';

export default function ResetPassword() {
  const { service } = useAuth();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const invalid = validateEmail(email);
    setFieldError(invalid ? t(invalid) : null);
    setFormError(null);
    if (invalid) return;
    setBusy(true);
    try {
      await service.sendPasswordReset(email);
      setSent(true);
    } catch (error) {
      const key = messageFor(error);
      // Do not reveal whether the email has an account: "not found" looks like success.
      if (key === 'auth.error.invalidCredentials') setSent(true);
      else setFormError(t(key));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('auth.reset.title') }} />
      {sent ? (
        <Card>
          <Text accessibilityLiveRegion="polite">{t('auth.reset.sent')}</Text>
        </Card>
      ) : (
        <>
          <ErrorBanner message={formError} />
          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            error={fieldError}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            testID="email"
          />
          <Button
            label={t('auth.reset.submit')}
            onPress={() => void submit()}
            loading={busy}
            testID="submit"
          />
        </>
      )}
      <Button label={t('auth.reset.back')} variant="link" onPress={() => router.push('/sign-in')} />
    </Screen>
  );
}
