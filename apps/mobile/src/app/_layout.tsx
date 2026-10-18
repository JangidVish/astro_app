import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
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
import { ThemePreferenceProvider } from '@/theme/theme-preference';
import { fonts } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const firebaseConfig = firebaseConfigFromEnv(FIREBASE_ENV);
const authService: AuthService | null = firebaseConfig
  ? createFirebaseAuthService(firebaseConfig)
  : null;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  // Keep the native splash until Inter is ready (or failed: then system fonts are used).
  if (!fontsLoaded && !fontError) return null;
  return (
    <ThemePreferenceProvider>
      <App />
    </ThemePreferenceProvider>
  );
}

function App() {
  const [queryClient] = useState(createQueryClient);
  const { colors, scheme } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;

  return (
    <SafeAreaProvider>
      <ThemeProvider
        value={{
          ...base,
          fonts: {
            regular: { fontFamily: fonts.regular, fontWeight: '400' },
            medium: { fontFamily: fonts.medium, fontWeight: '500' },
            bold: { fontFamily: fonts.semibold, fontWeight: '600' },
            heavy: { fontFamily: fonts.bold, fontWeight: '700' },
          },
          colors: {
            ...base.colors,
            background: colors.background,
            card: colors.surface,
            text: colors.text,
            border: colors.hairline,
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
