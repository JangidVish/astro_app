/**
 * App configuration from EXPO_PUBLIC_* variables, which Expo inlines at build time.
 * Only public values belong here: anything EXPO_PUBLIC_ ends up in the app bundle. Provider keys
 * and other secrets live on the API server only (NFR-1).
 */
import Constants from 'expo-constants';

const DEV_API_PORT = 8080;
const DEV_AUTH_EMULATOR_PORT = 9099;

/**
 * In development, the address of the computer running Metro as the device sees it (from the dev
 * server URL, e.g. "192.168.0.105:8081"). A phone, an emulator and a simulator all reach the API
 * and the Auth emulator at that same address, so no IP has to be configured by hand.
 */
export function devHostFrom(hostUri: string | null | undefined): string {
  const host = (hostUri ?? '').trim().split(':')[0];
  return host || '127.0.0.1';
}

const DEV_HOST = devHostFrom(Constants.expoConfig?.hostUri);

export function resolveApiBaseUrl(
  value: string | undefined,
  isDev: boolean,
  devHost = '127.0.0.1',
): string {
  const url = (value ?? '').trim() || (isDev ? `http://${devHost}:${String(DEV_API_PORT)}` : '');
  if (!url) throw new Error('EXPO_PUBLIC_API_URL must be set for release builds');
  if (!isDev && !url.startsWith('https://')) {
    throw new Error('EXPO_PUBLIC_API_URL must use https in release builds');
  }
  return url.replace(/\/+$/, '');
}

export const API_BASE_URL = resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_URL, __DEV__, DEV_HOST);

/** "auto" means the Auth emulator on the dev machine (development builds only). */
export function resolveAuthEmulatorUrl(
  value: string | undefined,
  isDev: boolean,
  devHost = '127.0.0.1',
): string | undefined {
  const url = (value ?? '').trim();
  if (!isDev || !url) return undefined; // release builds never talk to an emulator
  return url === 'auto' ? `http://${devHost}:${String(DEV_AUTH_EMULATOR_PORT)}` : url;
}

/**
 * Firebase web config. Each variable must be referenced statically (process.env.EXPO_PUBLIC_X):
 * Expo inlines only static references, so reading process.env dynamically would yield nothing.
 */
export const FIREBASE_ENV: Record<string, string | undefined> = {
  EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: resolveAuthEmulatorUrl(
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_URL,
    __DEV__,
    DEV_HOST,
  ),
};
