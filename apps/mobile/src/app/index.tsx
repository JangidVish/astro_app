import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { Card, Screen, Text } from '@/components/ui';
import { useApi } from '@/lib/api-context';
import { API_BASE_URL } from '@/lib/config';

/** Temporary home (T8.1): proves the app reaches the API. Replaced by the signed-in flow in T8.2. */
export default function Home() {
  const api = useApi();
  const health = useQuery({ queryKey: ['health'], queryFn: () => api.health() });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Astro' }} />
      <Text variant="title">Astro</Text>
      <Card>
        <Text variant="label">Server connection</Text>
        {health.isPending ? (
          <ActivityIndicator accessibilityLabel="Checking server connection" />
        ) : health.isSuccess ? (
          <Text color="success" accessibilityLiveRegion="polite">
            Connected
          </Text>
        ) : (
          <Text color="danger" accessibilityLiveRegion="polite">
            Cannot reach the server
          </Text>
        )}
        <Text variant="caption" color="textMuted">
          {API_BASE_URL}
        </Text>
      </Card>
    </Screen>
  );
}
