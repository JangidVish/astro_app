// Maps validated AstrologyAPI responses to internal models. Each mapper enforces the invariants
// the rest of the app relies on and throws MappingError when the data cannot be trusted; the
// provider turns that into ProviderError('malformed'), and malformed data is never cached.
import {
  GRAHAS,
  SIGNS,
  isValidCalendarDate,
  timezoneIdSchema,
  type ChartBody,
  type ChartHouse,
  type DashaPeriod,
  type Graha,
  type PlanetPosition,
} from '@astro/shared';
import type { z } from 'zod';
import type { DailyPrediction, ProviderPlace } from '../provider.js';
import {
  DASHA_DATE,
  type birthDetailsSchema,
  type dailyNakshatraPredictionSchema,
  type dashaSchema,
  type geoDetailsSchema,
  type horoChartSchema,
  type planetsSchema,
  type timezoneWithDstSchema,
} from './schemas.js';

export class MappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MappingError';
  }
}

function fail(message: string): never {
  throw new MappingError(message);
}

const BODY_BY_NAME = new Map<string, ChartBody>(
  [...GRAHAS, 'Ascendant' as const].map((body) => [body.toUpperCase(), body]),
);

/** Western outer planets some charts include; they are not part of Vedic charts, so we drop them. */
const IGNORED_BODIES = new Set(['URANUS', 'NEPTUNE', 'PLUTO']);

function bodyOf(name: string): ChartBody | null {
  const key = name.trim().toUpperCase();
  if (IGNORED_BODIES.has(key)) return null;
  return BODY_BY_NAME.get(key) ?? fail('unknown body in response');
}

function grahaOf(name: string): Graha {
  const body = bodyOf(name);
  if (body === null || body === 'Ascendant') fail('expected a graha');
  return body;
}

function signOf(signNumber: number) {
  return SIGNS[signNumber - 1] ?? fail('sign number out of range');
}

function signNumberOfName(name: string): number {
  const index = SIGNS.findIndex((s) => s.toLowerCase() === name.trim().toLowerCase());
  return index === -1 ? fail('unknown sign name') : index + 1;
}

function intInRange(value: number, min: number, max: number, what: string): number {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${what} out of range`);
  return value;
}

// ---------------------------------------------------------------- places and time

export function mapGeoDetails(raw: z.infer<typeof geoDetailsSchema>): ProviderPlace[] {
  return raw.geonames.map((g) => {
    if (Math.abs(g.latitude) > 90 || Math.abs(g.longitude) > 180) fail('coordinates out of range');
    if (!timezoneIdSchema.safeParse(g.timezone_id).success) fail('invalid timezone id');
    return {
      name: g.place_name.trim(),
      countryCode: g.country_code.toUpperCase(),
      lat: g.latitude,
      lon: g.longitude,
      timezoneId: g.timezone_id,
    };
  });
}

/** Provider returns hours as a float (5.5, 5.75); we use whole minutes. */
export function mapTimezoneOffset(raw: z.infer<typeof timezoneWithDstSchema>): number {
  const minutes = Math.round(raw.timezone * 60);
  return intInRange(minutes, -14 * 60, 14 * 60, 'timezone offset');
}

export function mapBirthDetails(raw: z.infer<typeof birthDetailsSchema>) {
  // Lahiri is about 23-25 degrees for 1900-2100; anything else means a different system or junk.
  if (raw.ayanamsha < 20 || raw.ayanamsha > 26) fail('ayanamsa outside expected range');
  return { ayanamsa: raw.ayanamsha };
}

// ---------------------------------------------------------------- planets

export function mapPlanets(raw: z.infer<typeof planetsSchema>): PlanetPosition[] {
  const planets: PlanetPosition[] = [];
  const seen = new Set<ChartBody>();
  for (const p of raw) {
    const body = bodyOf(p.name);
    if (body === null) continue;
    if (seen.has(body)) fail('duplicate body');
    seen.add(body);

    if (p.fullDegree < 0 || p.fullDegree >= 360) fail('longitude out of range');
    if (p.normDegree < 0 || p.normDegree >= 30) fail('degree in sign out of range');
    const signNumber = Math.floor(p.fullDegree / 30) + 1;
    // The sign name must agree with the longitude; a mismatch means the data is inconsistent.
    if (signNumberOfName(p.sign) !== signNumber) fail('sign does not match longitude');

    planets.push({
      body,
      sign: signOf(signNumber),
      signNumber,
      degreeInSign: p.normDegree,
      fullDegree: p.fullDegree,
      nakshatra: p.nakshatra.trim(),
      nakshatraPada: intInRange(p.nakshatra_pad, 1, 4, 'nakshatra pada'),
      house: intInRange(p.house, 1, 12, 'house'),
      isRetrograde: p.isRetro,
    });
  }
  if (seen.size !== GRAHAS.length + 1) fail('missing bodies: expected 9 grahas and the Ascendant');
  return planets;
}

// ---------------------------------------------------------------- charts

/**
 * The provider lists the 12 houses in order, house 1 (the Lagna sign) first, and signs advance
 * by one per house. Every graha must appear exactly once.
 */
export function mapChart(raw: z.infer<typeof horoChartSchema>): ChartHouse[] {
  if (raw.length !== 12) fail('chart must have 12 houses');
  const placed = new Set<Graha>();
  const first = raw[0] ?? fail('chart must have 12 houses');
  const lagnaSign = intInRange(first.sign, 1, 12, 'sign');

  const houses = raw.map((entry, index) => {
    const signNumber = intInRange(entry.sign, 1, 12, 'sign');
    if (signNumber !== ((lagnaSign - 1 + index) % 12) + 1) fail('chart signs are not consecutive');
    if (signNumberOfName(entry.sign_name) !== signNumber) fail('sign name does not match number');

    const bodies: ChartBody[] = [];
    for (const name of entry.planet) {
      const body = bodyOf(name);
      if (body === null || body === 'Ascendant') continue;
      if (placed.has(body)) fail('graha placed twice');
      placed.add(body);
      bodies.push(body);
    }
    return { house: index + 1, sign: signOf(signNumber), signNumber, bodies };
  });

  if (placed.size !== GRAHAS.length) fail('chart is missing grahas');
  return houses;
}

// ---------------------------------------------------------------- dasha

/**
 * Parses "d-m-yyyy H:m" given in the birth place's offset, returning UTC ISO-8601.
 * (Interpretation in birth-local time is to be confirmed against the live API in T3.4.)
 */
export function parseDashaDate(text: string, utcOffsetMinutes: number): string {
  const match = DASHA_DATE.exec(text) ?? fail('bad dasha date');
  const [day, month, year, hour, minute] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (!isValidCalendarDate(year, month, day)) fail('invalid dasha date');
  intInRange(hour, 0, 23, 'dasha hour');
  intInRange(minute, 0, 59, 'dasha minute');
  const ms = Date.UTC(year, month - 1, day, hour, minute) - utcOffsetMinutes * 60_000;
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

function mapPeriods(raw: z.infer<typeof dashaSchema>, utcOffsetMinutes: number): DashaPeriod[] {
  if (raw.length !== 9) fail('expected 9 dasha periods');
  const periods = raw.map((p) => ({
    lord: grahaOf(p.planet),
    start: parseDashaDate(p.start, utcOffsetMinutes),
    end: parseDashaDate(p.end, utcOffsetMinutes),
  }));
  if (new Set(periods.map((p) => p.lord)).size !== 9) fail('dasha lords repeat');
  periods.forEach((p, i) => {
    if (Date.parse(p.start) >= Date.parse(p.end)) fail('dasha period ends before it starts');
    const previous = periods[i - 1];
    if (previous && previous.end !== p.start) fail('dasha periods are not contiguous');
  });
  return periods;
}

export function mapMajorDasha(raw: z.infer<typeof dashaSchema>, utcOffsetMinutes: number) {
  return mapPeriods(raw, utcOffsetMinutes);
}

export function mapSubDasha(
  raw: z.infer<typeof dashaSchema>,
  utcOffsetMinutes: number,
  mahadasha: Graha,
): DashaPeriod[] {
  const periods = mapPeriods(raw, utcOffsetMinutes);
  // Antardashas always begin with the Mahadasha lord; anything else is the wrong period's data.
  if (periods[0]?.lord !== mahadasha) fail('antardashas do not start with the mahadasha lord');
  return periods;
}

// ---------------------------------------------------------------- prediction

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** "7 July 2017" -> "2017-07-07". */
export function parsePredictionDate(text: string): string {
  const [dayText, monthText, yearText] = text.trim().split(/\s+/);
  const day = Number(dayText);
  const month = MONTHS.indexOf((monthText ?? '').toLowerCase()) + 1;
  const year = Number(yearText);
  if (month === 0 || !isValidCalendarDate(year, month, day)) fail('invalid prediction date');
  return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function mapDailyPrediction(
  raw: z.infer<typeof dailyNakshatraPredictionSchema>,
): DailyPrediction {
  signNumberOfName(raw.birth_moon_sign); // must be a real sign
  return {
    forDate: parsePredictionDate(raw.prediction_date),
    moonSign: raw.birth_moon_sign.trim(),
    nakshatra: raw.birth_moon_nakshatra.trim(),
    sections: {
      health: raw.prediction.health.trim(),
      emotions: raw.prediction.emotions.trim(),
      profession: raw.prediction.profession.trim(),
      luck: raw.prediction.luck.trim(),
      personalLife: raw.prediction.personal_life.trim(),
      travel: raw.prediction.travel.trim(),
    },
  };
}
