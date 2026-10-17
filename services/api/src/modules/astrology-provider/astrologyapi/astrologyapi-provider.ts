import type { ChartType, Graha } from '@astro/shared';
import type { z } from 'zod';
import { ProviderError } from '../errors.js';
import type { AstrologyProvider, BirthInput, PredictionDay, ProviderResult } from '../provider.js';
import type { AstrologyApiClient } from './client.js';
import {
  MappingError,
  mapBirthDetails,
  mapChart,
  mapDailyPrediction,
  mapGeoDetails,
  mapMajorDasha,
  mapPlanets,
  mapSubDasha,
  mapTimezoneOffset,
} from './mappers.js';
import {
  birthDetailsSchema,
  dailyNakshatraPredictionSchema,
  dashaSchema,
  geoDetailsSchema,
  horoChartSchema,
  planetsSchema,
  timezoneWithDstSchema,
} from './schemas.js';

/** Request body shared by all birth-data endpoints. */
function birthBody(input: BirthInput) {
  return {
    day: input.date.day,
    month: input.date.month,
    year: input.date.year,
    hour: input.time.hour,
    min: input.time.minute,
    lat: input.lat,
    lon: input.lon,
    tzone: input.utcOffsetMinutes / 60,
  };
}

/** AstrologyAPI.com implementation of AstrologyProvider. */
export class AstrologyApiProvider implements AstrologyProvider {
  readonly source = 'astrologyapi' as const;

  constructor(private readonly client: AstrologyApiClient) {}

  /** POST, validate the raw shape, map it. Any validation or mapping failure is `malformed`. */
  private async fetch<S extends z.ZodType, T>(
    endpoint: string,
    body: Record<string, unknown>,
    schema: S,
    map: (parsed: z.infer<S>) => T,
  ): Promise<ProviderResult<T>> {
    const raw = await this.client.post(endpoint, body);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new ProviderError('malformed', endpoint, { cause: parsed.error });
    try {
      return { data: map(parsed.data), raw, source: this.source, endpoint };
    } catch (error) {
      if (error instanceof MappingError) {
        throw new ProviderError('malformed', endpoint, { cause: error });
      }
      throw error;
    }
  }

  searchPlaces(query: string, maxRows: number) {
    return this.fetch('geo_details', { place: query, maxRows }, geoDetailsSchema, mapGeoDetails);
  }

  getTimezoneOffset(lat: number, lon: number, date: { year: number; month: number; day: number }) {
    const mmddyyyy = `${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}-${String(date.year)}`;
    return this.fetch(
      'timezone_with_dst',
      { latitude: lat, longitude: lon, date: mmddyyyy },
      timezoneWithDstSchema,
      mapTimezoneOffset,
    );
  }

  getBirthDetails(input: BirthInput) {
    return this.fetch('birth_details', birthBody(input), birthDetailsSchema, mapBirthDetails);
  }

  getPlanets(input: BirthInput) {
    return this.fetch('planets', birthBody(input), planetsSchema, mapPlanets);
  }

  getChart(input: BirthInput, type: ChartType) {
    return this.fetch(`horo_chart/${type}`, birthBody(input), horoChartSchema, mapChart);
  }

  getMajorDasha(input: BirthInput) {
    return this.fetch('major_vdasha', birthBody(input), dashaSchema, (raw) =>
      mapMajorDasha(raw, input.utcOffsetMinutes),
    );
  }

  getSubDasha(input: BirthInput, mahadasha: Graha) {
    // The path parameter is the lowercase planet name, e.g. sub_vdasha/venus.
    return this.fetch(
      `sub_vdasha/${mahadasha.toLowerCase()}`,
      birthBody(input),
      dashaSchema,
      (raw) => mapSubDasha(raw, input.utcOffsetMinutes, mahadasha),
    );
  }

  getDailyPrediction(input: BirthInput, day: PredictionDay) {
    const endpoint =
      day === 'today' ? 'daily_nakshatra_prediction' : `daily_nakshatra_prediction/${day}`;
    return this.fetch(
      endpoint,
      birthBody(input),
      dailyNakshatraPredictionSchema,
      mapDailyPrediction,
    );
  }
}
