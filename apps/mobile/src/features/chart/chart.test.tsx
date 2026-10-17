import { render, screen } from '@testing-library/react-native';
import { GRAHAS, SIGNS, type ChartHouse, type PlanetPosition } from '@astro/shared';
import { ApiError } from '@/lib/api-client';
import { NorthIndianChart } from './north-indian-chart';
import {
  describeChart,
  northIndianCells,
  northIndianLayout,
  wrapLabels,
} from './north-indian-layout';
import { formatDegree, PlanetTable } from './planet-table';
import { readingErrorMessage } from './reading-error';

// The live AstrologyAPI sample chart (T3.4 fixture shape): Libra lagna.
const houses: ChartHouse[] = SIGNS.map((_, i) => {
  const signNumber = ((7 - 1 + i) % 12) + 1;
  const bodies: Record<number, ChartHouse['bodies']> = {
    4: ['Ketu'],
    7: ['Moon'],
    8: ['Jupiter', 'Saturn'],
    9: ['Sun', 'Mars', 'Mercury', 'Venus'],
    10: ['Rahu'],
  };
  return {
    house: i + 1,
    sign: SIGNS[signNumber - 1] ?? 'Aries',
    signNumber,
    bodies: bodies[i + 1] ?? [],
  };
});
const planets: PlanetPosition[] = [
  {
    body: 'Ascendant',
    sign: 'Libra',
    signNumber: 7,
    degreeInSign: 27.93,
    fullDegree: 207.93,
    nakshatra: 'Vishakha',
    nakshatraPada: 3,
    house: 1,
    isRetrograde: false,
  },
  {
    body: 'Mercury',
    sign: 'Gemini',
    signNumber: 3,
    degreeInSign: 25.49,
    fullDegree: 85.49,
    nakshatra: 'Punarvasu',
    nakshatraPada: 2,
    house: 9,
    isRetrograde: true,
  },
  {
    body: 'Rahu',
    sign: 'Cancer',
    signNumber: 4,
    degreeInSign: 1.76,
    fullDegree: 91.76,
    nakshatra: 'Punarvasu',
    nakshatraPada: 4,
    house: 10,
    isRetrograde: true,
  },
  {
    body: 'Sun',
    sign: 'Gemini',
    signNumber: 3,
    degreeInSign: 12.1895,
    fullDegree: 72.19,
    nakshatra: 'Ardra',
    nakshatraPada: 2,
    house: 9,
    isRetrograde: false,
  },
];

describe('northIndianCells (geometry)', () => {
  const size = 400;
  const cells = northIndianCells(size);
  const centroid = (h: number) => {
    const poly = cells.find((c) => c.house === h)?.polygon ?? [];
    return {
      x: poly.reduce((a, p) => a + p.x, 0) / poly.length,
      y: poly.reduce((a, p) => a + p.y, 0) / poly.length,
    };
  };

  it('has 12 cells, all inside the square', () => {
    expect(cells.map((c) => c.house)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const c of cells)
      for (const p of c.polygon) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(size);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(size);
      }
  });

  it('places the kendra diamonds at top (1), left (4), bottom (7) and right (10)', () => {
    expect(centroid(1)).toEqual({ x: 200, y: 100 });
    expect(centroid(4)).toEqual({ x: 100, y: 200 });
    expect(centroid(7)).toEqual({ x: 200, y: 300 });
    expect(centroid(10)).toEqual({ x: 300, y: 200 });
  });

  it('runs counter-clockwise: house 2 top-left, 3 left-upper, 12 top-right', () => {
    const c2 = centroid(2);
    const c3 = centroid(3);
    const c12 = centroid(12);
    expect(c2.x).toBeLessThan(200);
    expect(c2.y).toBeLessThan(c3.y);
    expect(c3.x).toBeLessThan(c2.x);
    expect(c12.x).toBeGreaterThan(200);
    expect(c12.y).toBeLessThan(100);
  });

  it('every cell is a distinct region (centroids differ)', () => {
    const keys = new Set(cells.map((c) => `${centroid(c.house).x},${centroid(c.house).y}`));
    expect(keys.size).toBe(12);
  });
});

describe('northIndianLayout (data)', () => {
  const layout = northIndianLayout(houses, planets, 400);
  const labels = (h: number) => layout.find((c) => c.house === h)?.labels;

  it('puts the Ascendant in house 1 and each graha in its house', () => {
    expect(labels(1)).toEqual(['As']);
    expect(labels(7)).toEqual(['Mo']);
    expect(layout.find((c) => c.house === 1)?.signNumber).toBe(7);
    expect(layout.flatMap((c) => c.labels).filter((l) => l !== 'As')).toHaveLength(GRAHAS.length);
  });

  it('marks retrograde planets with ℞, but not Rahu/Ketu (always retrograde)', () => {
    expect(labels(9)).toEqual(['Su', 'Ma', 'Me℞', 'Ve']);
    expect(labels(10)).toEqual(['Ra']);
  });

  it('wraps crowded houses', () => {
    expect(wrapLabels(['Su', 'Ma', 'Me', 'Ve', 'Ju'], 2)).toEqual(['Su Ma', 'Me Ve', 'Ju']);
  });

  it('refuses a chart missing a house', () => {
    expect(() => northIndianLayout(houses.slice(1), planets, 400)).toThrow(/house 1/);
  });

  it('describes the chart for screen readers', () => {
    expect(describeChart(houses)).toMatch(/^House 1, Libra: Ascendant\. House 2, Scorpio\./);
  });
});

describe('NorthIndianChart component', () => {
  it('renders one accessible image with a spoken summary', async () => {
    await render(
      <NorthIndianChart houses={houses} planets={planets} title="Birth chart (D1)" size={320} />,
    );
    const chart = screen.getByTestId('north-indian-chart');
    expect(chart.props.accessibilityRole).toBe('image');
    expect(chart.props.accessibilityLabel).toMatch(
      /^Birth chart \(D1\)\. House 1, Libra: Ascendant/,
    );
  });

  it('renders consistently (snapshot)', async () => {
    const view = await render(
      <NorthIndianChart houses={houses} planets={planets} title="D1" size={320} />,
    );
    expect(view.toJSON()).toMatchSnapshot();
  });
});

describe('PlanetTable', () => {
  it.each([
    [12.1895, '12°11′'],
    [0, '0°00′'],
    [29.999, '29°59′'],
    [null, '—'],
  ])('formatDegree(%s) = %s', (deg, text) => {
    expect(formatDegree(deg)).toBe(text);
  });

  it('gives each row a full spoken description, including retrograde', async () => {
    await render(<PlanetTable planets={planets} />);
    expect(
      screen.getByLabelText('Mercury, Gemini 25°29′, Punarvasu 2, House 9, retrograde'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Ascendant, Libra 27°55′, Vishakha 3, House 1')).toBeTruthy();
  });

  it('shows dashes for withheld values when the birth time is unknown', async () => {
    const masked: PlanetPosition = {
      ...planets[3]!,
      degreeInSign: null,
      fullDegree: null,
      nakshatraPada: null,
      house: null,
    };
    await render(<PlanetTable planets={[masked]} />);
    expect(screen.getByLabelText('Sun, Gemini, Ardra')).toBeTruthy();
  });
});

describe('readingErrorMessage', () => {
  it.each([
    ['QUOTA_EXCEEDED', 'reading.quota'],
    ['PROVIDER_UNAVAILABLE', 'reading.unavailable'],
    ['PROVIDER_ERROR', 'reading.unavailable'],
    ['NETWORK', 'common.offline'],
    ['BIRTH_TIME_REQUIRED', 'chart.timeUnknown'],
    ['INTERNAL', 'common.error'],
  ] as const)('%s -> %s', (code, key) => {
    expect(readingErrorMessage(new ApiError(code, 503, 'x', true))).toBe(key);
  });
});
