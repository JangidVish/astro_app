// Deterministic mock data for local development and tests ONLY (never prod; see factory.ts).
// Values are synthetic. Sun/Moon/Lagna follow AstrologyAPI's documented sample response
// (Sun in Gemini in house 9, Moon in Aries/Ashwini pada 4 in house 7, Libra Lagna) so mock
// screens look like real output. Everything is labelled as mock where users could see it.
import { GRAHAS, SIGNS, type ChartBody, type Graha, type PlanetPosition } from '@astro/shared';
import type { DailyPrediction, ProviderPlace } from '../provider.js';

export const NAKSHATRAS = [
  'Ashwini',
  'Bharani',
  'Krittika',
  'Rohini',
  'Mrigashira',
  'Ardra',
  'Punarvasu',
  'Pushya',
  'Ashlesha',
  'Magha',
  'Purva Phalguni',
  'Uttara Phalguni',
  'Hasta',
  'Chitra',
  'Swati',
  'Vishakha',
  'Anuradha',
  'Jyeshtha',
  'Mula',
  'Purva Ashadha',
  'Uttara Ashadha',
  'Shravana',
  'Dhanishta',
  'Shatabhisha',
  'Purva Bhadrapada',
  'Uttara Bhadrapada',
  'Revati',
] as const;

const NAKSHATRA_SPAN = 360 / 27;
const PADA_SPAN = NAKSHATRA_SPAN / 4;

/** Vimshottari order and period lengths in years (120 in total). */
export const VIMSHOTTARI: readonly { lord: Graha; years: number }[] = [
  { lord: 'Ketu', years: 7 },
  { lord: 'Venus', years: 20 },
  { lord: 'Sun', years: 6 },
  { lord: 'Moon', years: 10 },
  { lord: 'Mars', years: 7 },
  { lord: 'Rahu', years: 18 },
  { lord: 'Jupiter', years: 16 },
  { lord: 'Saturn', years: 19 },
  { lord: 'Mercury', years: 17 },
];

/** Sidereal longitudes (degrees) of the mock chart. */
const LONGITUDES: Record<ChartBody, { fullDegree: number; isRetrograde: boolean }> = {
  Ascendant: { fullDegree: 192.5, isRetrograde: false },
  Sun: { fullDegree: 72.1895, isRetrograde: false },
  Moon: { fullDegree: 11.7235, isRetrograde: false },
  Mars: { fullDegree: 345.2, isRetrograde: false },
  Mercury: { fullDegree: 55.0, isRetrograde: false },
  Jupiter: { fullDegree: 96.4, isRetrograde: false },
  Venus: { fullDegree: 40.3, isRetrograde: false },
  Saturn: { fullDegree: 290.6, isRetrograde: true },
  Rahu: { fullDegree: 280.9, isRetrograde: true },
  Ketu: { fullDegree: 100.9, isRetrograde: true },
};

const BODY_ORDER: readonly ChartBody[] = ['Ascendant', ...GRAHAS];

/** 1-based sign number for a sidereal longitude. */
export function signNumberOf(fullDegree: number): number {
  return Math.floor(fullDegree / 30) + 1;
}

/** 1-based navamsa (D9) sign number: each sign is split into nine 3°20' parts. */
export function navamsaSignNumberOf(fullDegree: number): number {
  return (Math.floor((fullDegree * 9) / 30) % 12) + 1;
}

/** Whole-sign house of a sign, counted from the Lagna sign. */
export function houseOf(signNumber: number, lagnaSignNumber: number): number {
  return ((signNumber - lagnaSignNumber + 12) % 12) + 1;
}

function signName(signNumber: number) {
  const name = SIGNS[signNumber - 1];
  if (!name) throw new Error(`invalid sign number ${String(signNumber)}`);
  return name;
}

export function nakshatraOf(fullDegree: number): { name: string; pada: number } {
  const index = Math.floor(fullDegree / NAKSHATRA_SPAN);
  const name = NAKSHATRAS[index];
  if (!name) throw new Error(`invalid longitude ${String(fullDegree)}`);
  const pada = Math.floor((fullDegree - index * NAKSHATRA_SPAN) / PADA_SPAN) + 1;
  return { name, pada };
}

/** D1 planet table. */
export function mockPlanets(): PlanetPosition[] {
  const lagnaSign = signNumberOf(LONGITUDES.Ascendant.fullDegree);
  return BODY_ORDER.map((body) => {
    const { fullDegree, isRetrograde } = LONGITUDES[body];
    const signNumber = signNumberOf(fullDegree);
    const nakshatra = nakshatraOf(fullDegree);
    return {
      body,
      sign: signName(signNumber),
      signNumber,
      degreeInSign: Math.round((fullDegree - (signNumber - 1) * 30) * 10_000) / 10_000,
      fullDegree,
      nakshatra: nakshatra.name,
      nakshatraPada: nakshatra.pada,
      house: houseOf(signNumber, lagnaSign),
      isRetrograde,
    };
  });
}

/** North Indian chart houses (1..12) for D1 or D9. */
export function mockChartHouses(type: 'D1' | 'D9') {
  const signFor = (fullDegree: number) =>
    type === 'D1' ? signNumberOf(fullDegree) : navamsaSignNumberOf(fullDegree);
  const lagnaSign = signFor(LONGITUDES.Ascendant.fullDegree);
  return Array.from({ length: 12 }, (_, i) => {
    const house = i + 1;
    const signNumber = ((lagnaSign - 1 + i) % 12) + 1;
    const bodies = GRAHAS.filter(
      (graha) => houseOf(signFor(LONGITUDES[graha].fullDegree), lagnaSign) === house,
    );
    return { house, sign: signName(signNumber), signNumber, bodies: [...bodies] };
  });
}

export const MOCK_MOON = (() => {
  const fullDegree = LONGITUDES.Moon.fullDegree;
  return {
    fullDegree,
    sign: signName(signNumberOf(fullDegree)),
    nakshatra: nakshatraOf(fullDegree),
  };
})();

export function mockPrediction(forDate: string): DailyPrediction {
  const note = '[MOCK] Development data, not a real prediction.';
  return {
    forDate,
    moonSign: MOCK_MOON.sign,
    nakshatra: MOCK_MOON.nakshatra.name,
    sections: {
      health: `${note} Health section.`,
      emotions: `${note} Emotions section.`,
      profession: `${note} Profession section.`,
      luck: `${note} Luck section.`,
      personalLife: `${note} Personal life section.`,
      travel: `${note} Travel section.`,
    },
  };
}

export const MOCK_PLACES: readonly ProviderPlace[] = [
  { name: 'Mumbai', countryCode: 'IN', lat: 19.0728, lon: 72.8826, timezoneId: 'Asia/Kolkata' },
  {
    name: 'Navi Mumbai',
    countryCode: 'IN',
    lat: 19.0368,
    lon: 73.0158,
    timezoneId: 'Asia/Kolkata',
  },
  { name: 'Pune', countryCode: 'IN', lat: 18.5196, lon: 73.8553, timezoneId: 'Asia/Kolkata' },
  { name: 'Varanasi', countryCode: 'IN', lat: 25.3167, lon: 83.0104, timezoneId: 'Asia/Kolkata' },
  {
    name: 'Kathmandu',
    countryCode: 'NP',
    lat: 27.7017,
    lon: 85.3206,
    timezoneId: 'Asia/Kathmandu',
  },
  { name: 'London', countryCode: 'GB', lat: 51.5085, lon: -0.1257, timezoneId: 'Europe/London' },
  {
    name: 'New York',
    countryCode: 'US',
    lat: 40.7143,
    lon: -74.006,
    timezoneId: 'America/New_York',
  },
];
