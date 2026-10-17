import type { ChartHouse, ChartType, DashaPeriod, Graha, PlanetPosition } from '@astro/shared';

/**
 * Birth data as the provider needs it. Built by the birth-profiles module (T5.3).
 * When the birth time is unknown, callers pass 12:00 local and mark readings accordingly (FR-8).
 */
export interface BirthInput {
  readonly date: { readonly year: number; readonly month: number; readonly day: number };
  readonly time: { readonly hour: number; readonly minute: number };
  readonly lat: number;
  readonly lon: number;
  /** UTC offset at the birth instant, from the tz database (T5.1). */
  readonly utcOffsetMinutes: number;
}

export type ProviderSource = 'astrologyapi' | 'mock';

/**
 * Every provider result carries the mapped data, the raw provider response (stored so mapping
 * fixes need no new credits, data-model 2.3), and its source. Mock data is always labelled.
 */
export interface ProviderResult<T> {
  readonly data: T;
  readonly raw: unknown;
  readonly source: ProviderSource;
  readonly endpoint: string;
}

export interface ProviderPlace {
  readonly name: string;
  readonly countryCode: string;
  readonly lat: number;
  readonly lon: number;
  readonly timezoneId: string;
}

export interface BirthDetails {
  /** Ayanamsa in degrees (Lahiri expected; verified live in T3.4). */
  readonly ayanamsa: number;
}

export type PredictionDay = 'previous' | 'today' | 'next';

export interface DailyPrediction {
  /** The calendar date (yyyy-mm-dd) the provider says this prediction is for. Cache key. */
  readonly forDate: string;
  readonly moonSign: string;
  readonly nakshatra: string;
  readonly sections: {
    readonly health: string;
    readonly emotions: string;
    readonly profession: string;
    readonly luck: string;
    readonly personalLife: string;
    readonly travel: string;
  };
}

/**
 * The only way the app talks to an astrology data source. Implementations:
 * - AstrologyApiProvider (T3.2/T3.3): AstrologyAPI.com over HTTPS.
 * - MockProvider: deterministic fixtures for local development and tests. Never in prod.
 *
 * Methods throw ProviderError on failure and never return invented data.
 */
export interface AstrologyProvider {
  readonly source: ProviderSource;
  searchPlaces(query: string, maxRows: number): Promise<ProviderResult<ProviderPlace[]>>;
  /** UTC offset (minutes) at a place on a date. Used to cross-check our tz database (T3.4). */
  getTimezoneOffset(
    lat: number,
    lon: number,
    date: { year: number; month: number; day: number },
  ): Promise<ProviderResult<number>>;
  getBirthDetails(input: BirthInput): Promise<ProviderResult<BirthDetails>>;
  getPlanets(input: BirthInput): Promise<ProviderResult<PlanetPosition[]>>;
  getChart(input: BirthInput, type: ChartType): Promise<ProviderResult<ChartHouse[]>>;
  getMajorDasha(input: BirthInput): Promise<ProviderResult<DashaPeriod[]>>;
  getSubDasha(input: BirthInput, mahadasha: Graha): Promise<ProviderResult<DashaPeriod[]>>;
  getDailyPrediction(
    input: BirthInput,
    day: PredictionDay,
  ): Promise<ProviderResult<DailyPrediction>>;
}

export type ProviderMethod = Exclude<keyof AstrologyProvider, 'source'>;
