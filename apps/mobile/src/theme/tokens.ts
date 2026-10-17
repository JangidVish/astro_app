import { Platform } from 'react-native';

/**
 * Design tokens. Night-indigo with saffron accents: calm, traditional, readable.
 * Every text/background pairing used in the app is checked for WCAG AA (4.5:1) in tokens.test.ts.
 */
export const palettes = {
  light: {
    background: '#FBF8F3',
    surface: '#FFFFFF',
    surfaceAlt: '#F2ECE2',
    text: '#1B1640',
    textMuted: '#4A4570',
    primary: '#3B2F8F',
    onPrimary: '#FFFFFF',
    accent: '#9A4A06',
    border: '#8C8170',
    danger: '#B42318',
    success: '#067647',
    chartLine: '#3B2F8F',
  },
  dark: {
    background: '#0F0C29',
    surface: '#1B1640',
    surfaceAlt: '#262054',
    text: '#F4F1FA',
    textMuted: '#C9C3E3',
    primary: '#B9AEFF',
    onPrimary: '#0F0C29',
    accent: '#F5A524',
    border: '#7671B0',
    danger: '#F97066',
    success: '#47CD89',
    chartLine: '#B9AEFF',
  },
} as const;

export type Palette = { readonly [K in keyof (typeof palettes)['light']]: string };
export type ColorName = keyof Palette;

/** 4-point spacing scale. */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 6, md: 12, lg: 20 } as const;

/** Minimum touch target (WCAG 2.5.5 / platform guidance). */
export const MIN_TOUCH = 44;

export const fonts = Platform.select({
  ios: { body: 'system-ui', heading: 'ui-serif' },
  default: { body: 'sans-serif', heading: 'serif' },
});

/**
 * Type scale. Sizes are base values: React Native scales them with the user's text-size
 * setting (allowFontScaling is on by default), so layouts must tolerate larger text.
 */
export const typography = {
  title: { fontSize: 28, lineHeight: 36, fontWeight: '600' },
  heading: { fontSize: 22, lineHeight: 30, fontWeight: '600' },
  subheading: { fontSize: 18, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  label: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

export type TextVariant = keyof typeof typography;
