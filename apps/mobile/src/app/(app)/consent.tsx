import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { PRIVACY_POLICY_VERSION, TERMS_VERSION } from '@astro/shared';
import { useAuth } from '@/auth/auth-context';
import { Button, ErrorBanner } from '@/components/form';
import { Card, Screen, Text } from '@/components/ui';
import { meQueryKey } from '@/features/account/use-me';
import { t } from '@/i18n/en';
import { useApi } from '@/lib/api-context';

/** Shown until the current privacy policy and terms are accepted (FR-22, NFR-9). */
export default function Consent() {
  const api = useApi();
  const { state } = useAuth();
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
    <Screen>
      <Stack.Screen options={{ title: t('consent.title') }} />
      <Text variant="heading">{t('consent.title')}</Text>
      <Card>
        <Text>{t('consent.body')}</Text>
        <Text color="textMuted">{t('consent.disclaimer')}</Text>
      </Card>
      {/* Policy texts are pending legal review (backlog M0.6); links are added with them. */}
      <Text variant="caption" color="textMuted">
        {t('consent.privacy')} {PRIVACY_POLICY_VERSION} · {t('consent.terms')} {TERMS_VERSION}
      </Text>
      <ErrorBanner message={accept.isError ? t('common.error') : null} />
      <Button
        label={t('consent.accept')}
        onPress={() => accept.mutate()}
        loading={accept.isPending}
        testID="accept"
      />
    </Screen>
  );
}
