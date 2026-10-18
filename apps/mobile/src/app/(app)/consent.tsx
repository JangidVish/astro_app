import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@astro/shared';
import { useAuth } from '@/auth/auth-context';
import { Button, ErrorBanner } from '@/components/form';
import { Card, Icon, IconTile, Screen, Text, type IconName } from '@/components/ui';
import { meQueryKey } from '@/features/account/use-me';
import { t } from '@/i18n/en';
import { useApi } from '@/lib/api-context';
import { radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Shown until the current privacy policy and terms are accepted (FR-22, NFR-9). */
export default function Consent() {
  const api = useApi();
  const { state } = useAuth();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: () =>
      api.updateMe({
        acceptConsent: { privacyVersion: PRIVACY_POLICY_VERSION, termsVersion: TERMS_VERSION },
      }),
    onSuccess: (me) => {
      if (state.status === 'signedIn') queryClient.setQueryData(meQueryKey(state.user.uid), me);
      router.replace('/');
    },
  });

  return (
    <Screen style={styles.screen}>
      <Stack.Screen options={{ title: t('consent.title') }} />
      <Text variant="title">{t('consent.title')}</Text>

      {/* The consent wording itself is legal text: shown exactly, not restyled into copy. */}
      <Card style={[styles.stripe, { borderLeftColor: colors.accent }]}>
        <View style={styles.row}>
          <Icon name="lock-outline" color="primary" />
          <Text variant="subheading">{t('consent.dataTitle')}</Text>
        </View>
        <Text>{t('consent.body')}</Text>
      </Card>

      <Card tone="muted">
        <View style={styles.row}>
          <Icon name="auto-awesome" color="accent" />
          <Text variant="overline" color="accent">
            {t('consent.guidanceTitle')}
          </Text>
        </View>
        <Text>{t('consent.disclaimer')}</Text>
      </Card>

      <View style={styles.section}>
        <Text variant="overline" color="textMuted">
          {t('consent.documents')}
        </Text>
        {/* Links to the published texts are added with the final legal copy (backlog M0.6). */}
        <Card style={styles.list}>
          <PolicyRow icon="policy" title={t('consent.privacy')} version={PRIVACY_POLICY_VERSION} />
          <View style={[styles.rule, { backgroundColor: colors.hairline }]} />
          <PolicyRow icon="gavel" title={t('consent.terms')} version={TERMS_VERSION} />
        </Card>
      </View>

      <ErrorBanner message={accept.isError ? t('common.error') : null} />
      <Button
        label={t('consent.accept')}
        icon="check"
        onPress={() => accept.mutate()}
        loading={accept.isPending}
        testID="accept"
      />
    </Screen>
  );
}

function PolicyRow({ icon, title, version }: { icon: IconName; title: string; version: string }) {
  return (
    <View style={styles.policy}>
      <IconTile name={icon} />
      <View style={styles.flex}>
        <Text variant="label">{title}</Text>
        <Text variant="caption" color="textMuted">
          {t('consent.version')} {version}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  stripe: { borderLeftWidth: 4, borderTopLeftRadius: radius.sm, borderBottomLeftRadius: radius.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  section: { gap: spacing.sm },
  list: { paddingVertical: spacing.sm, gap: 0 },
  policy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rule: { height: 1 },
  flex: { flex: 1 },
});
