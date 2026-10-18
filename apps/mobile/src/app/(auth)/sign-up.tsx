import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '@/auth/auth-context';
import { InlineLink } from '@/components/form';
import { Card, Icon, Screen, Text } from '@/components/ui';
import { EmailPasswordForm } from '@/features/auth/email-password-form';
import { t } from '@/i18n/en';
import { spacing } from '@/theme/tokens';

export default function SignUp() {
  const { service } = useAuth();
  return (
    <Screen>
      <Stack.Screen options={{ title: t('auth.signUp.title') }} />
      <Card tone="muted">
        <Text variant="heading">{t('auth.signUp.title')}</Text>
        <Text color="textMuted">{t('auth.signUp.intro')}</Text>
      </Card>
      <EmailPasswordForm
        mode="signUp"
        onSubmit={(email, password) => service.signUpWithEmail(email, password)}
      />
      <Card tone="muted">
        <View style={styles.note}>
          <Icon name="verified-user" color="accent" />
          <Text variant="caption" color="textMuted" style={styles.flex}>
            {t('auth.signUp.privacyNote')}
          </Text>
        </View>
      </Card>
      <InlineLink
        prompt={t('auth.signUp.haveAccountPrompt')}
        action={t('auth.signUp.signIn')}
        onPress={() => router.push('/sign-in')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
});
