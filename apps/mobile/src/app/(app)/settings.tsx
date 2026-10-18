import Constants from 'expo-constants';
import { router, Stack } from 'expo-router';
import { useContext, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@astro/shared';
import { useAuth } from '@/auth/auth-context';
import { Button, SegmentedTabs } from '@/components/form';
import { Card, Icon, Screen, Text, type IconName } from '@/components/ui';
import { DeleteAccount } from '@/features/account/delete-account';
import { t } from '@/i18n/en';
import { ThemePreferenceContext, type ThemePreference } from '@/theme/theme-preference';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: t('settings.theme.light'), icon: 'light-mode' },
  { value: 'dark', label: t('settings.theme.dark'), icon: 'dark-mode' },
  { value: 'system', label: t('settings.theme.system'), icon: 'brightness-auto' },
];

function LegalRow({ icon, title, value }: { icon: IconName; title: string; value: string }) {
  return (
    <View style={styles.row}>
      <Icon name={icon} />
      <Text style={styles.flex}>{title}</Text>
      <Text variant="caption" color="textMuted">
        {value}
      </Text>
    </View>
  );
}

export default function Settings() {
  const { state, service } = useAuth();
  const { colors } = useTheme();
  const { preference, setPreference } = useContext(ThemePreferenceContext);
  const [deleting, setDeleting] = useState(false);
  const email = state.status === 'signedIn' ? state.user.email : null;

  return (
    <Screen>
      <Stack.Screen options={{ title: t('settings.title'), headerShown: true }} />

      <Card style={styles.card}>
        <Text variant="subheading">{t('settings.account')}</Text>
        {email && (
          <View style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text variant="label" color="onPrimary">
                {email.slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.flex}>{email}</Text>
          </View>
        )}
        <Button
          label={t('auth.signOut')}
          variant="secondary"
          icon="logout"
          onPress={() => void service.signOut()}
        />
      </Card>

      <Card style={styles.card}>
        <Text variant="subheading">{t('settings.appearance')}</Text>
        <SegmentedTabs
          as="radio"
          label={t('settings.appearance')}
          options={THEME_OPTIONS}
          value={preference}
          onChange={setPreference}
        />
      </Card>

      <Card style={styles.card}>
        <Text variant="subheading">{t('settings.legal')}</Text>
        {/* Links to the published texts are added with the final legal copy (backlog M0.6). */}
        <LegalRow icon="policy" title={t('consent.privacy')} value={PRIVACY_POLICY_VERSION} />
        <LegalRow icon="gavel" title={t('consent.terms')} value={TERMS_VERSION} />
        <LegalRow
          icon="info-outline"
          title={t('settings.version')}
          value={Constants.expoConfig?.version ?? '—'}
        />
        <Card tone="muted">
          <Text variant="caption" color="textMuted">
            {t('consent.disclaimer')}
          </Text>
        </Card>
      </Card>

      {deleting ? (
        <DeleteAccount
          onDeleted={() => router.replace('/sign-in')}
          onCancel={() => setDeleting(false)}
        />
      ) : (
        <Card
          style={[styles.card, { backgroundColor: colors.dangerSoft, borderColor: 'transparent' }]}
        >
          <View style={styles.row}>
            <Icon name="warning-amber" color="onDangerSoft" />
            <Text variant="subheading" color="onDangerSoft">
              {t('settings.dangerZone')}
            </Text>
          </View>
          <Text color="onDangerSoft">{t('delete.body')}</Text>
          <Button
            label={t('settings.deleteAccount')}
            variant="danger"
            icon="delete-forever"
            onPress={() => setDeleting(true)}
            testID="start-delete"
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md, padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
});
