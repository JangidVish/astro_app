import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, render, screen } from '@testing-library/react-native';
import { useContext } from 'react';
import { Text } from 'react-native';
import { ThemePreferenceContext, ThemePreferenceProvider } from './theme-preference';
import { resolveScheme, useTheme } from './use-theme';

describe('resolveScheme', () => {
  it.each([
    ['system', 'dark', 'dark'],
    ['system', 'light', 'light'],
    ['system', null, 'light'],
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
  ] as const)('%s with phone %s -> %s', (preference, system, scheme) => {
    expect(resolveScheme(preference, system)).toBe(scheme);
  });
});

function Probe() {
  const { scheme } = useTheme();
  const { setPreference } = useContext(ThemePreferenceContext);
  return (
    <Text testID="scheme" onPress={() => setPreference('dark')}>
      {scheme}
    </Text>
  );
}

describe('ThemePreferenceProvider', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('applies and remembers the choice', async () => {
    await render(
      <ThemePreferenceProvider>
        <Probe />
      </ThemePreferenceProvider>,
    );
    expect(screen.getByTestId('scheme').props.children).toBe('light');
    await act(async () => {
      screen.getByTestId('scheme').props.onPress();
    });
    expect(screen.getByTestId('scheme').props.children).toBe('dark');
    expect(await AsyncStorage.getItem('astro.themePreference')).toBe('dark');
  });

  it('restores a saved choice on start', async () => {
    await AsyncStorage.setItem('astro.themePreference', 'dark');
    await render(
      <ThemePreferenceProvider>
        <Probe />
      </ThemePreferenceProvider>,
    );
    await act(async () => undefined);
    expect(screen.getByTestId('scheme').props.children).toBe('dark');
  });

  it('ignores an unknown saved value', async () => {
    await AsyncStorage.setItem('astro.themePreference', 'purple');
    await render(
      <ThemePreferenceProvider>
        <Probe />
      </ThemePreferenceProvider>,
    );
    await act(async () => undefined);
    expect(screen.getByTestId('scheme').props.children).toBe('light');
  });
});
