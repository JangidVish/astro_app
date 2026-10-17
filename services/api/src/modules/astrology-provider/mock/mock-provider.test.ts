import { beforeEach, describe, expect, it } from 'vitest';
import {
  chartHouseSchema,
  dashaPeriodSchema,
  GRAHAS,
  planetPositionSchema,
  type ChartBody,
} from '@astro/shared';
import { PROVIDER_ERROR_KINDS, ProviderError } from '../errors.js';
import type { BirthInput } from '../provider.js';
import { MockProvider } from './mock-provider.js';
import { houseOf, NAKSHATRAS, nakshatraOf, VIMSHOTTARI } from './fixtures.js';

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

const BIRTH: BirthInput = {
  date: { year: 1990, month: 5, day: 10 },
  time: { hour: 19, minute: 55 },
  lat: 19.0728,
  lon: 72.8826,
  utcOffsetMinutes: 330,
};
const BIRTH_MS = Date.UTC(1990, 4, 10, 19, 55) - 330 * 60_000;

let mock: MockProvider;
beforeEach(() => {
  mock = new MockProvider();
});

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProviderError) return error.kind;
    throw error;
  }
  return 'no error';
}

describe('MockProvider: results are labelled as mock', () => {
  it('marks source and raw on every result', async () => {
    const results = await Promise.all([
      mock.getPlanets(BIRTH),
      mock.getChart(BIRTH, 'D1'),
      mock.getMajorDasha(BIRTH),
      mock.getDailyPrediction(BIRTH, 'today'),
      mock.searchPlaces('mum', 5),
    ]);
    for (const result of results) {
      expect(result.source).toBe('mock');
      expect(result.raw).toMatchObject({ mock: true });
    }
  });

  it('labels prediction text so it cannot be mistaken for a real reading', async () => {
    const { data } = await mock.getDailyPrediction(BIRTH, 'today');
    for (const text of Object.values(data.sections)) expect(text).toMatch(/^\[MOCK\]/);
  });
});

describe('MockProvider: planets', () => {
  it('returns the 9 grahas plus the Ascendant, each matching the shared contract', async () => {
    const { data } = await mock.getPlanets(BIRTH);
    expect(data.map((p) => p.body).sort()).toEqual([...GRAHAS, 'Ascendant'].sort());
    for (const planet of data) expect(planetPositionSchema.parse(planet)).toEqual(planet);
  });

  it('is internally consistent: houses follow the Lagna, padas follow the degrees', async () => {
    const { data } = await mock.getPlanets(BIRTH);
    const lagna = data.find((p) => p.body === 'Ascendant');
    expect(lagna?.house).toBe(1);
    for (const planet of data) {
      expect(planet.house).toBe(houseOf(planet.signNumber, lagna?.signNumber ?? 0));
      const expected = nakshatraOf(planet.fullDegree ?? 0);
      expect([planet.nakshatra, planet.nakshatraPada]).toEqual([expected.name, expected.pada]);
      expect(planet.degreeInSign).toBeCloseTo((planet.fullDegree ?? 0) % 30, 3);
    }
  });

  it("matches AstrologyAPI's documented sample for Sun, Moon and Lagna", async () => {
    const byBody = new Map((await mock.getPlanets(BIRTH)).data.map((p) => [p.body, p]));
    expect(byBody.get('Ascendant')).toMatchObject({ sign: 'Libra' });
    expect(byBody.get('Sun')).toMatchObject({
      sign: 'Gemini',
      house: 9,
      nakshatra: 'Ardra',
      nakshatraPada: 2,
    });
    expect(byBody.get('Moon')).toMatchObject({
      sign: 'Aries',
      house: 7,
      nakshatra: 'Ashwini',
      nakshatraPada: 4,
    });
  });
});

describe('MockProvider: charts', () => {
  it.each(['D1', 'D9'] as const)(
    '%s has 12 ordered houses holding each graha exactly once',
    async (type) => {
      const { data } = await mock.getChart(BIRTH, type);
      expect(data).toHaveLength(12);
      data.forEach((house, i) => {
        expect(chartHouseSchema.parse(house)).toEqual(house);
        expect(house.house).toBe(i + 1);
        // Signs advance one per house from the Lagna sign.
        expect(house.signNumber).toBe((((data[0]?.signNumber ?? 0) - 1 + i) % 12) + 1);
      });
      const placed: ChartBody[] = data.flatMap((h) => h.bodies);
      expect(placed.sort()).toEqual([...GRAHAS].sort());
    },
  );

  it('D1 places grahas in the same houses as the planet table', async () => {
    const chart = (await mock.getChart(BIRTH, 'D1')).data;
    const planets = (await mock.getPlanets(BIRTH)).data;
    for (const graha of GRAHAS) {
      const house = chart.find((h) => h.bodies.includes(graha))?.house;
      expect(house).toBe(planets.find((p) => p.body === graha)?.house);
    }
  });

  it('D9 differs from D1', async () => {
    const d1 = (await mock.getChart(BIRTH, 'D1')).data;
    const d9 = (await mock.getChart(BIRTH, 'D9')).data;
    expect(d9).not.toEqual(d1);
  });
});

describe('MockProvider: dasha', () => {
  it('returns 9 contiguous Mahadashas totalling 120 years, starting with the Moon nakshatra lord', async () => {
    const { data } = await mock.getMajorDasha(BIRTH);
    expect(data).toHaveLength(9);
    for (const period of data) dashaPeriodSchema.parse(period);
    // Moon is in Ashwini, ruled by Ketu.
    expect(NAKSHATRAS.indexOf('Ashwini') % 9).toBe(0);
    expect(data[0]?.lord).toBe('Ketu');
    expect(data.map((p) => p.lord)).toEqual(VIMSHOTTARI.map((v) => v.lord));
    for (let i = 1; i < data.length; i++) expect(data[i]?.start).toBe(data[i - 1]?.end);
    const span = Date.parse(data[8]?.end ?? '') - Date.parse(data[0]?.start ?? '');
    expect(span / YEAR_MS).toBeCloseTo(120, 2);
  });

  it('places the birth instant inside the first, partly elapsed Mahadasha', async () => {
    const [first] = (await mock.getMajorDasha(BIRTH)).data;
    expect(Date.parse(first?.start ?? '')).toBeLessThan(BIRTH_MS);
    expect(Date.parse(first?.end ?? '')).toBeGreaterThan(BIRTH_MS);
  });

  it('Antardashas start with the Mahadasha lord and exactly fill the Mahadasha', async () => {
    const venus = (await mock.getMajorDasha(BIRTH)).data.find((p) => p.lord === 'Venus');
    const { data } = await mock.getSubDasha(BIRTH, 'Venus');
    expect(data[0]?.lord).toBe('Venus');
    expect(data).toHaveLength(9);
    expect(
      Math.abs(Date.parse(data[0]?.start ?? '') - Date.parse(venus?.start ?? '')),
    ).toBeLessThanOrEqual(1000);
    expect(
      Math.abs(Date.parse(data[8]?.end ?? '') - Date.parse(venus?.end ?? '')),
    ).toBeLessThanOrEqual(1000);
    for (const period of data) dashaPeriodSchema.parse(period);
  });

  it('moves with the birth instant (a later birth shifts every period)', async () => {
    const later = { ...BIRTH, date: { ...BIRTH.date, year: 2000 } };
    const a = (await mock.getMajorDasha(BIRTH)).data[0]?.start ?? '';
    const b = (await mock.getMajorDasha(later)).data[0]?.start ?? '';
    expect((Date.parse(b) - Date.parse(a)) / YEAR_MS).toBeCloseTo(10, 1);
  });
});

describe('MockProvider: places', () => {
  it('filters case-insensitively and honours maxRows', async () => {
    expect((await mock.searchPlaces('MUM', 5)).data.map((p) => p.name)).toEqual([
      'Mumbai',
      'Navi Mumbai',
    ]);
    expect((await mock.searchPlaces('mum', 1)).data).toHaveLength(1);
    expect((await mock.searchPlaces('Atlantis', 5)).data).toEqual([]);
  });
});

describe('MockProvider: input checks', () => {
  it.each([
    ['NaN latitude', { ...BIRTH, lat: Number.NaN }],
    ['latitude out of range', { ...BIRTH, lat: 91 }],
    ['offset beyond 14h', { ...BIRTH, utcOffsetMinutes: 15 * 60 }],
    ['fractional offset minutes', { ...BIRTH, utcOffsetMinutes: 330.5 }],
  ])('rejects %s as bad_request instead of returning data', async (_label, input) => {
    expect(await kindOf(mock.getPlanets(input))).toBe('bad_request');
  });

  it('rejects an unknown Mahadasha lord', async () => {
    expect(await kindOf(mock.getSubDasha(BIRTH, 'Pluto' as never))).toBe('bad_request');
  });
});

describe('MockProvider: failures behave like a real async provider', () => {
  it('returns a rejected promise instead of throwing synchronously', async () => {
    mock.failNext('getPlanets', 'timeout');
    let pending: Promise<unknown> | undefined;
    expect(() => {
      pending = mock.getPlanets(BIRTH);
    }).not.toThrow();
    await expect(pending).rejects.toBeInstanceOf(ProviderError);

    let invalid: Promise<unknown> | undefined;
    expect(() => {
      invalid = mock.getPlanets({ ...BIRTH, lat: Number.NaN });
    }).not.toThrow();
    await expect(invalid).rejects.toBeInstanceOf(ProviderError);
  });
});

describe('MockProvider: failure injection', () => {
  it.each(PROVIDER_ERROR_KINDS)('can fail with %s', async (kind) => {
    mock.failNext('getChart', kind);
    expect(await kindOf(mock.getChart(BIRTH, 'D1'))).toBe(kind);
  });

  it('failNext fails once, in queue order, then succeeds', async () => {
    mock.failNext('getPlanets', 'timeout').failNext('getPlanets', 'server');
    expect(await kindOf(mock.getPlanets(BIRTH))).toBe('timeout');
    expect(await kindOf(mock.getPlanets(BIRTH))).toBe('server');
    expect(await kindOf(mock.getPlanets(BIRTH))).toBe('no error');
  });

  it('failAlways persists until reset, and only affects that method', async () => {
    mock.failAlways('getMajorDasha', 'quota');
    expect(await kindOf(mock.getMajorDasha(BIRTH))).toBe('quota');
    expect(await kindOf(mock.getMajorDasha(BIRTH))).toBe('quota');
    expect(await kindOf(mock.getPlanets(BIRTH))).toBe('no error');
    mock.reset();
    expect(await kindOf(mock.getMajorDasha(BIRTH))).toBe('no error');
  });

  it('records calls, including failed ones, for cache assertions', async () => {
    mock.failNext('getChart', 'timeout');
    await kindOf(mock.getChart(BIRTH, 'D1'));
    await mock.getChart(BIRTH, 'D9');
    expect(mock.callCount('getChart')).toBe(2);
    expect(mock.callCount('getPlanets')).toBe(0);
    expect(mock.calls[1]?.args[1]).toBe('D9');
  });
});
