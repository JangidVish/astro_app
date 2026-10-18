import { router, Stack } from 'expo-router';
import { useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { messageFor } from '@/auth/messages';
import { AppMark } from '@/components/app-mark';
import { Button, Divider, ErrorBanner, InlineLink } from '@/components/form';
import { Card, Screen, Text } from '@/components/ui';
import { EmailPasswordForm } from '@/features/auth/email-password-form';
import { t } from '@/i18n/en';
import { MIN_TOUCH, radius, spacing } from '@/theme/tokens';
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
    <Screen style={styles.screen}>
      <Stack.Screen options={{ title: t('auth.signIn.title'), headerShown: false }} />
      <View style={styles.brand}>
        <AppMark />
        <Text variant="title" color="primary" style={styles.center}>
          {t('app.name')}
        </Text>
        <Text color="textMuted" style={styles.center}>
          {t('app.tagline')}
        </Text>
      </View>

      <Card style={styles.card}>
        <EmailPasswordForm
          mode="signIn"
          onSubmit={(email, password) => service.signInWithEmail(email, password)}
          beforeSubmit={
            <View style={styles.forgot}>
              <Button
                label={t('auth.signIn.forgot')}
                variant="link"
                onPress={() => router.push('/reset-password')}
              />
            </View>
          }
        />
        {(service.apple || service.google) && <Divider label={t('auth.or')} />}
        <ErrorBanner message={providerError} />
        {service.apple && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={
              scheme === 'dark'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={radius.md}
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
            icon="login"
            onPress={() => {
              const google = service.google;
              if (google) void withProvider(() => google.signIn());
            }}
          />
        )}
        <InlineLink
          prompt={t('auth.signIn.noAccountPrompt')}
          action={t('auth.signIn.createAccount')}
          onPress={() => router.push('/sign-up')}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xxl, gap: spacing.lg },
  brand: { alignItems: 'center', gap: spacing.sm },
  center: { textAlign: 'center' },
  card: { gap: spacing.md, padding: spacing.lg },
  forgot: { alignItems: 'flex-end', marginTop: -spacing.sm },
  apple: { height: MIN_TOUCH + 4 },
});
