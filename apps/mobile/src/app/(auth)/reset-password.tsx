import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { messageFor } from '@/auth/messages';
import { validateEmail } from '@/auth/validation';
import { Button, ErrorBanner, TextField } from '@/components/form';
import { Card, Icon, IconTile, Screen, Text } from '@/components/ui';
import { t } from '@/i18n/en';
import { spacing } from '@/theme/tokens';

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
    <Screen style={styles.screen}>
      <Stack.Screen options={{ title: t('auth.reset.title') }} />
      <View style={styles.intro}>
        <IconTile name={sent ? 'mark-email-read' : 'key'} />
        <Text variant="heading" style={styles.center}>
          {t('auth.reset.title')}
        </Text>
        {!sent && (
          <Text color="textMuted" style={styles.center}>
            {t('auth.reset.intro')}
          </Text>
        )}
      </View>
      {sent ? (
        <Card>
          <View style={styles.row}>
            <Icon name="check-circle" color="success" />
            <Text accessibilityLiveRegion="polite" style={styles.flex}>
              {t('auth.reset.sent')}
            </Text>
          </View>
        </Card>
      ) : (
        <Card style={styles.card}>
          <ErrorBanner message={formError} />
          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            error={fieldError}
            placeholder={t('auth.emailPlaceholder')}
            icon="alternate-email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="send"
            onSubmitEditing={() => void submit()}
            testID="email"
          />
          <Button
            label={t('auth.reset.submit')}
            icon="send"
            onPress={() => void submit()}
            loading={busy}
            testID="submit"
          />
        </Card>
      )}
      <Button
        label={t('auth.reset.back')}
        variant="link"
        icon="arrow-back"
        onPress={() => router.push('/sign-in')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  intro: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md },
  center: { textAlign: 'center' },
  card: { gap: spacing.md, padding: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
});
