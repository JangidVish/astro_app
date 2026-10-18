import { useContext } from 'react';
import { useColorScheme } from 'react-native';
import { ThemePreferenceContext, type ThemePreference } from './theme-preference';
import { palettes, type Palette } from './tokens';

/** Light or dark, from the user's choice in Settings, else the phone's setting. */
export function resolveScheme(
  preference: ThemePreference,
  system: string | null | undefined,
): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return system === 'dark' ? 'dark' : 'light';
}

/** Current palette. */
export function useTheme(): { colors: Palette; scheme: 'light' | 'dark' } {
  const system = useColorScheme();
  const { preference } = useContext(ThemePreferenceContext);
  const scheme = resolveScheme(preference, system);
  return { colors: palettes[scheme], scheme };
}
