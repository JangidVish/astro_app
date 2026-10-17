import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '@/auth/auth-context';
import type { AuthService } from '@/auth/auth-service';
import { createFirebaseAuthService, firebaseConfigFromEnv } from '@/auth/firebase-auth';
import { Screen, Text } from '@/components/ui';
import { ApiProvider } from '@/lib/api-context';
import { FIREBASE_ENV } from '@/lib/config';
import { t } from '@/i18n/en';
import { createQueryClient } from '@/lib/query-client';
import { useTheme } from '@/theme/use-theme';

const firebaseConfig = firebaseConfigFromEnv(FIREBASE_ENV);
const authService: AuthService | null = firebaseConfig
  ? createFirebaseAuthService(firebaseConfig)
  : null;

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const { colors, scheme } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <SafeAreaProvider>
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
        {authService ? (
          <AuthProvider service={authService}>
            <QueryClientProvider client={queryClient}>
              <ApiProvider getIdToken={() => authService.getIdToken()}>
                <Stack screenOptions={{ headerShown: false }} />
              </ApiProvider>
            </QueryClientProvider>
          </AuthProvider>
        ) : (
          <Screen>
            <Text variant="heading">{t('config.title')}</Text>
            <Text>{t('config.body')}</Text>
          </Screen>
        )}
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
