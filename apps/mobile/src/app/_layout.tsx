import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiProvider } from '@/lib/api-context';
import { createQueryClient } from '@/lib/query-client';
import { useTheme } from '@/theme/use-theme';

// Until sign-in lands (T8.2) requests are unauthenticated; only /healthz works.
const noToken = () => Promise.resolve(null);

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const { colors, scheme } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ApiProvider getIdToken={noToken}>
          <ThemeProvider
            value={{
              ...base,
              colors: {
                ...base.colors,
                background: colors.background,
                card: colors.surface,
                text: colors.text,
                border: colors.border,
                primary: colors.primary,
              },
            }}
          >
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerTitleStyle: { color: colors.text } }} />
          </ThemeProvider>
        </ApiProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
