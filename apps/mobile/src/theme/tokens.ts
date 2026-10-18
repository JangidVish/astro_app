/**
 * Design tokens from the Stitch design system "Vedic Celestial Minimalism": indigo primary,
 * saffron accent, warm off-white surfaces (dark palette derived to match).
 * Every text/background pairing used in the app is checked for WCAG AA (4.5:1) in tokens.test.ts.
 */
export const palettes = {
  light: {
    background: '#FCF9F4',
    surface: '#FFFFFF',
    surfaceAlt: '#F0EDE9',
    text: '#1C1C19',
    textMuted: '#474552',
    primary: '#3B2F8F',
    onPrimary: '#FFFFFF',
    primarySoft: '#E4DFFF',
    onPrimarySoft: '#2E2380',
    accent: '#974804',
    accentSoft: '#FFDBC8',
    onAccentSoft: '#6F3200',
    border: '#787583',
    /** Decorative dividers only; never the sole edge of an input or control. */
    hairline: '#E5E2DD',
    danger: '#BA1A1A',
    onDanger: '#FFFFFF',
    dangerSoft: '#FFDAD6',
    onDangerSoft: '#93000A',
    success: '#067647',
    // North Indian chart: saffron ground with traditional graha colours (Sun copper, Moon blue,
    // Mars red, Mercury green, Jupiter gold, Venus pink, Saturn dark blue, Rahu smoke, Ketu brown).
    chartBg: '#FFF4E0',
    chartLagna: '#FFE0B2',
    chartLine: '#C2410C',
    chartSign: '#7A4A12',
    chartAscendant: '#7B1E1E',
    chartRetro: '#0B6177',
    grahaSun: '#9C3D08',
    grahaMoon: '#2F5D8A',
    grahaMars: '#B42318',
    grahaMercury: '#11703A',
    grahaJupiter: '#7A5A00',
    grahaVenus: '#A3207A',
    grahaSaturn: '#1F2A6B',
    grahaRahu: '#4B4B5C',
    grahaKetu: '#6B4423',
  },
  dark: {
    background: '#13121A',
    surface: '#1E1C27',
    surfaceAlt: '#2A2735',
    text: '#E7E3EE',
    textMuted: '#C8C4D4',
    primary: '#C6BFFF',
    onPrimary: '#1F1366',
    primarySoft: '#3A3275',
    onPrimarySoft: '#E4DFFF',
    accent: '#FFB68A',
    accentSoft: '#5A2A05',
    onAccentSoft: '#FFDBC8',
    border: '#928F9C',
    hairline: '#34313F',
    danger: '#FFB4AB',
    onDanger: '#690005',
    dangerSoft: '#690005',
    onDangerSoft: '#FFDAD6',
    success: '#6DD58C',
    chartBg: '#24180B',
    chartLagna: '#3A260F',
    chartLine: '#F5A524',
    chartSign: '#E8C9A0',
    chartAscendant: '#FFD089',
    chartRetro: '#5EEAD4',
    grahaSun: '#FFB46B',
    grahaMoon: '#9CC3EE',
    grahaMars: '#FF8A80',
    grahaMercury: '#7EDC9A',
    grahaJupiter: '#F5D061',
    grahaVenus: '#F49AD8',
    grahaSaturn: '#B4B9FF',
    grahaRahu: '#C4C4D4',
    grahaKetu: '#D9B48C',
  },
} as const;

export type Palette = { readonly [K in keyof (typeof palettes)['light']]: string };
export type ColorName = keyof Palette;

/** 4-point spacing scale. */
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

/** Minimum touch target (WCAG 2.5.5 / platform guidance). */
export const MIN_TOUCH = 44;

/**
 * Inter, one file per weight: Android cannot synthesise weights from fontWeight alone, so each
 * text style names its exact face. Loaded in the root layout before the first screen renders.
 */
export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

/**
 * Type scale (Stitch design system, body raised to 16 for reading comfort). Sizes are base
 * values: React Native scales them with the user's text-size setting, so layouts must tolerate
 * larger text.
 */
export const typography = {
  title: { fontSize: 28, lineHeight: 34, fontFamily: fonts.bold, letterSpacing: -0.5 },
  heading: { fontSize: 22, lineHeight: 28, fontFamily: fonts.semibold, letterSpacing: -0.3 },
  subheading: { fontSize: 17, lineHeight: 22, fontFamily: fonts.semibold, letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 24, fontFamily: fonts.regular },
  label: { fontSize: 15, lineHeight: 20, fontFamily: fonts.semibold },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fonts.medium },
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.semibold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
} as const;

export type TextVariant = keyof typeof typography;
