import { router, Stack } from 'expo-router';
import { useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { messageFor } from '@/auth/messages';
import { Button, ErrorBanner } from '@/components/form';
import { Screen, Text } from '@/components/ui';
import { EmailPasswordForm } from '@/features/auth/email-password-form';
import { t } from '@/i18n/en';
import { MIN_TOUCH } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function SignIn() {
  const { service } = useAuth();
  const { scheme } = useTheme();
  const [providerError, setProviderError] = useState<string | null>(null);

  async function withProvider(signIn: () => Promise<void>) {
    setProviderError(null);
    try {
      await signIn();
    } catch (error) {
      const key = messageFor(error);
      // Closing the Apple/Google sheet is a choice, not an error worth shouting about.
      if (key !== 'auth.error.cancelled') setProviderError(t(key));
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: t('auth.signIn.title') }} />
      <Text variant="title">{t('app.name')}</Text>
      <EmailPasswordForm
        mode="signIn"
        onSubmit={(email, password) => service.signInWithEmail(email, password)}
      />
      <Button
        label={t('auth.signIn.forgot')}
        variant="link"
        onPress={() => router.push('/reset-password')}
      />

      {(service.apple || service.google) && (
        <Text color="textMuted" style={styles.or}>
          {t('auth.or')}
        </Text>
      )}
      <ErrorBanner message={providerError} />
      {service.apple && (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={
            scheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={12}
          style={styles.apple}
          onPress={() => {
            const apple = service.apple;
            if (apple) void withProvider(() => apple.signIn());
          }}
        />
      )}
      {service.google && (
        <Button
          label={t('auth.google')}
          variant="secondary"
          onPress={() => {
            const google = service.google;
            if (google) void withProvider(() => google.signIn());
          }}
        />
      )}

      <Button
        label={t('auth.signIn.noAccount')}
        variant="link"
        onPress={() => router.push('/sign-up')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  or: { textAlign: 'center' },
  apple: { height: MIN_TOUCH + 4 },
});
