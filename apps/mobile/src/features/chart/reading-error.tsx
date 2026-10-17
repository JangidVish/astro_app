import { Button } from '@/components/form';
import { Card, Text } from '@/components/ui';
import { t, type MessageKey } from '@/i18n/en';
import { ApiError } from '@/lib/api-client';

/** Message for a failed reading: never invented content, always a clear reason (FR-21). */
export function readingErrorMessage(error: unknown): MessageKey {
  if (!(error instanceof ApiError)) return 'common.error';
  switch (error.code) {
    case 'QUOTA_EXCEEDED':
      return 'reading.quota';
    case 'PROVIDER_UNAVAILABLE':
    case 'PROVIDER_RATE_LIMITED':
    case 'PROVIDER_ERROR':
    case 'SERVICE_UNAVAILABLE':
      return 'reading.unavailable';
    case 'NETWORK':
    case 'TIMEOUT':
      return 'common.offline';
    case 'BIRTH_TIME_REQUIRED':
      return 'chart.timeUnknown';
    default:
      return 'common.error';
  }
}

export function ReadingError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const key = readingErrorMessage(error);
  const retryable = !(error instanceof ApiError) || error.retryable;
  return (
    <Card>
      <Text color="danger" accessibilityRole="alert">
        {t(key)}
      </Text>
      {retryable && key !== 'reading.quota' && (
        <Button label={t('common.retry')} variant="secondary" onPress={onRetry} />
      )}
    </Card>
  );
}
