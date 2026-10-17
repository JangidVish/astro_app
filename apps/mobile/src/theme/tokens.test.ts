import { contrastRatio } from './contrast';
import { palettes, type ColorName } from './tokens';

// Every foreground/background pair the UI uses. Text needs 4.5:1 (WCAG AA); non-text UI
// (borders of inputs, chart lines) needs 3:1 (WCAG 1.4.11).
const TEXT_PAIRS: [ColorName, ColorName][] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['text', 'surfaceAlt'],
  ['textMuted', 'background'],
  ['textMuted', 'surface'],
  ['textMuted', 'surfaceAlt'],
  ['onPrimary', 'primary'],
  ['primary', 'background'],
  ['primary', 'surface'],
  ['accent', 'background'],
  ['accent', 'surface'],
  ['danger', 'background'],
  ['danger', 'surface'],
  ['success', 'surface'],
];
const NON_TEXT_PAIRS: [ColorName, ColorName][] = [
  ['border', 'surface'],
  ['border', 'background'],
  ['border', 'surfaceAlt'],
  ['chartLine', 'surface'],
];

describe.each(['light', 'dark'] as const)('%s palette', (mode) => {
  const p = palettes[mode];

  it.each(TEXT_PAIRS)('%s on %s meets 4.5:1', (fg, bg) => {
    expect(contrastRatio(p[fg], p[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)('%s on %s meets 3:1', (fg, bg) => {
    expect(contrastRatio(p[fg], p[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 1);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
  });
});
