/**
 * App configuration from EXPO_PUBLIC_* variables, which Expo inlines at build time.
 * Only public values belong here: anything EXPO_PUBLIC_ ends up in the app bundle. Provider keys
 * and other secrets live on the API server only (NFR-1).
 */
const DEV_DEFAULT_API_URL = 'http://127.0.0.1:8080';

export function resolveApiBaseUrl(value: string | undefined, isDev: boolean): string {
  const url = (value ?? '').trim() || (isDev ? DEV_DEFAULT_API_URL : '');
  if (!url) throw new Error('EXPO_PUBLIC_API_URL must be set for release builds');
  if (!isDev && !url.startsWith('https://')) {
    throw new Error('EXPO_PUBLIC_API_URL must use https in release builds');
  }
  return url.replace(/\/+$/, '');
}

export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, __DEV__);

/**
 * Firebase web config. Each variable must be referenced statically (process.env.EXPO_PUBLIC_X):
 * Expo inlines only static references, so reading process.env dynamically would yield nothing.
 */
export const FIREBASE_ENV: Record<string, string | undefined> = {
  EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_URL,
};
