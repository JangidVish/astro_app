import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

/** The user's choice in Settings. "system" follows the phone's light/dark setting. */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

const STORAGE_KEY = 'astro.themePreference';

export interface ThemePreferenceValue {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const ThemePreferenceContext = createContext<ThemePreferenceValue>({
  preference: 'system',
  setPreference: () => undefined,
});

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Remembers the theme choice on the device. Storage failures are ignored: the app then simply
 * follows the phone's setting, which is always a valid fallback.
 */
export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setState] = useState<ThemePreference>('system');

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then(
      (stored) => {
        if (!cancelled && isPreference(stored)) setState(stored);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);
  return (
    <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
  );
}
