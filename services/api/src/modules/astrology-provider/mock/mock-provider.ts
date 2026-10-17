// MockProvider: deterministic stand-in for AstrologyAPI in local development and tests.
// It is NOT a calculation engine. Chart data is a fixed synthetic chart; dasha dates are laid out
// from the birth instant only so timelines look plausible. Never enabled in prod (factory.ts).
import { GRAHAS, type ChartType, type DashaPeriod, type Graha } from '@astro/shared';
import { ProviderError, type ProviderErrorKind } from '../errors.js';
import type {
  AstrologyProvider,
  BirthInput,
  PredictionDay,
  ProviderMethod,
  ProviderResult,
} from '../provider.js';
import {
  MOCK_MOON,
  MOCK_PLACES,
  VIMSHOTTARI,
  mockChartHouses,
  mockPlanets,
  mockPrediction,
} from './fixtures.js';

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const NAKSHATRA_SPAN = 360 / 27;

export interface MockCall {
  readonly method: ProviderMethod;
  readonly args: readonly unknown[];
}

export class MockProvider implements AstrologyProvider {
  readonly source = 'mock' as const;

  /** Every call, in order, for assertions such as "cache hit made no provider call". */
  readonly calls: MockCall[] = [];

  private readonly persistentFailures = new Map<ProviderMethod, ProviderErrorKind>();
  private readonly oneShotFailures = new Map<ProviderMethod, ProviderErrorKind[]>();

  /** Makes the next call to `method` fail with `kind`. Queues if called repeatedly. */
  failNext(method: ProviderMethod, kind: ProviderErrorKind): this {
    const queue = this.oneShotFailures.get(method) ?? [];
    queue.push(kind);
    this.oneShotFailures.set(method, queue);
    return this;
  }

  /** Makes every call to `method` fail with `kind` until `reset()`. */
  failAlways(method: ProviderMethod, kind: ProviderErrorKind): this {
    this.persistentFailures.set(method, kind);
    return this;
  }

  /** Clears injected failures and the call log. */
  reset(): void {
    this.persistentFailures.clear();
    this.oneShotFailures.clear();
    this.calls.length = 0;
  }

  callCount(method?: ProviderMethod): number {
    return method ? this.calls.filter((c) => c.method === method).length : this.calls.length;
  }

  /**
   * Runs one mock call. Failures (injected or bad input) become rejected promises, never
   * synchronous throws, so callers see exactly what a real HTTP provider would give them.
   */
  private call<T>(
    method: ProviderMethod,
    endpoint: string,
    args: readonly unknown[],
    produce: () => T,
  ): Promise<ProviderResult<T>> {
    try {
      this.calls.push({ method, args });
      const queued = this.oneShotFailures.get(method)?.shift();
      const kind = queued ?? this.persistentFailures.get(method);
      if (kind) throw new ProviderError(kind, endpoint);
      const data = produce();
      return Promise.resolve({ data, raw: { mock: true, endpoint }, source: 'mock', endpoint });
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Mirrors the real provider rejecting impossible input instead of inventing an answer. */
  private checkInput(input: BirthInput, endpoint: string): void {
    const { lat, lon, utcOffsetMinutes } = input;
    const valid =
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lon) <= 180 &&
      Number.isInteger(utcOffsetMinutes) &&
      Math.abs(utcOffsetMinutes) <= 14 * 60;
    if (!valid) throw new ProviderError('bad_request', endpoint, { status: 400 });
  }

  searchPlaces(query: string, maxRows: number) {
    return this.call('searchPlaces', 'geo_details', [query, maxRows], () => {
      const needle = query.trim().toLowerCase();
      return MOCK_PLACES.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, maxRows);
    });
  }

  getTimezoneOffset(lat: number, lon: number, date: { year: number; month: number; day: number }) {
    // Mock only knows India Standard Time; tests needing other zones use the real tz database.
    return this.call('getTimezoneOffset', 'timezone_with_dst', [lat, lon, date], () => 330);
  }

  getBirthDetails(input: BirthInput) {
    const endpoint = 'birth_details';
    return this.call('getBirthDetails', endpoint, [input], () => {
      this.checkInput(input, endpoint);
      return { ayanamsa: 23.7531 };
    });
  }

  getPlanets(input: BirthInput) {
    const endpoint = 'planets';
    return this.call('getPlanets', endpoint, [input], () => {
      this.checkInput(input, endpoint);
      return mockPlanets();
    });
  }

  getChart(input: BirthInput, type: ChartType) {
    const endpoint = `horo_chart/${type}`;
    return this.call('getChart', endpoint, [input, type], () => {
      this.checkInput(input, endpoint);
      return mockChartHouses(type);
    });
  }

  getMajorDasha(input: BirthInput) {
    const endpoint = 'major_vdasha';
    return this.call('getMajorDasha', endpoint, [input], () => {
      this.checkInput(input, endpoint);
      return majorPeriods(input);
    });
  }

  getSubDasha(input: BirthInput, mahadasha: Graha) {
    const endpoint = `sub_vdasha/${mahadasha}`;
    return this.call('getSubDasha', endpoint, [input, mahadasha], () => {
      this.checkInput(input, endpoint);
      const major = GRAHAS.includes(mahadasha)
        ? majorPeriods(input).find((p) => p.lord === mahadasha)
        : undefined;
      if (!major) throw new ProviderError('bad_request', endpoint, { status: 400 });
      return subPeriods(major);
    });
  }

  getDailyPrediction(input: BirthInput, day: PredictionDay) {
    const endpoint =
      day === 'today' ? 'daily_nakshatra_prediction' : `daily_nakshatra_prediction/${day}`;
    return this.call('getDailyPrediction', endpoint, [input, day], () => {
      this.checkInput(input, endpoint);
      const offsetDays = day === 'previous' ? -1 : day === 'next' ? 1 : 0;
      const forDate = new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
      return mockPrediction(forDate);
    });
  }
}

function birthInstantMs(input: BirthInput): number {
  const { year, month, day } = input.date;
  const { hour, minute } = input.time;
  return Date.UTC(year, month - 1, day, hour, minute) - input.utcOffsetMinutes * 60_000;
}

/** Nine Mahadashas starting with the Moon-nakshatra lord, the first one partly elapsed at birth. */
function majorPeriods(input: BirthInput): DashaPeriod[] {
  const moonDegree = MOCK_MOON.fullDegree;
  const nakshatraIndex = Math.floor(moonDegree / NAKSHATRA_SPAN);
  const firstIndex = nakshatraIndex % VIMSHOTTARI.length;
  const elapsedFraction = (moonDegree - nakshatraIndex * NAKSHATRA_SPAN) / NAKSHATRA_SPAN;

  const first = VIMSHOTTARI[firstIndex];
  if (!first) throw new Error('vimshottari table corrupt');
  let start = birthInstantMs(input) - elapsedFraction * first.years * YEAR_MS;

  return Array.from({ length: VIMSHOTTARI.length }, (_, i) => {
    const entry = VIMSHOTTARI[(firstIndex + i) % VIMSHOTTARI.length];
    if (!entry) throw new Error('vimshottari table corrupt');
    const end = start + entry.years * YEAR_MS;
    const period = { lord: entry.lord, start: iso(start), end: iso(end) };
    start = end;
    return period;
  });
}

/** Antardashas: start with the Mahadasha lord; each lasts MD years × AD years / 120. */
function subPeriods(major: DashaPeriod): DashaPeriod[] {
  const firstIndex = VIMSHOTTARI.findIndex((v) => v.lord === major.lord);
  const majorMs = Date.parse(major.end) - Date.parse(major.start);
  let start = Date.parse(major.start);
  return Array.from({ length: VIMSHOTTARI.length }, (_, i) => {
    const entry = VIMSHOTTARI[(firstIndex + i) % VIMSHOTTARI.length];
    if (!entry) throw new Error('vimshottari table corrupt');
    const end = start + (majorMs * entry.years) / 120;
    const period = { lord: entry.lord, start: iso(start), end: iso(end) };
    start = end;
    return period;
  });
}

/** ISO-8601 UTC without milliseconds, matching the shared `isoDateTime` contract. */
function iso(ms: number): string {
  return new Date(Math.round(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}
