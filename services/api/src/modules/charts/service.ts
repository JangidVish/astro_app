import { z } from 'zod';
import {
  chartHouseSchema,
  planetPositionSchema,
  type ChartResponse,
  type ChartType,
  type PlanetPosition,
  type PlanetsResponse,
} from '@astro/shared';
import type { AstrologyProvider } from '../astrology-provider/provider.js';
import type { ProfilesService } from '../birth-profiles/service.js';
import { requireBirthTime, type ReadingsCache } from '../readings/cache.js';

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * For an unknown birth time (12:00 assumed) only signs and nakshatras are meaningful (FR-8):
 * the Lagna, houses, exact degrees and padas depend on the time and are withheld.
 */
function maskForUnknownTime(planets: PlanetPosition[]): PlanetPosition[] {
  return planets
    .filter((p) => p.body !== 'Ascendant')
    .map((p) => ({ ...p, degreeInSign: null, fullDegree: null, nakshatraPada: null, house: null }));
}

export interface ChartsDeps {
  profiles: ProfilesService;
  provider: AstrologyProvider;
  cache: ReadingsCache;
}

export class ChartsService {
  constructor(private readonly deps: ChartsDeps) {}

  private async planets(
    uid: string,
    profile: Awaited<ReturnType<ProfilesService['loadForReadings']>>,
  ) {
    return this.deps.cache.get(
      uid,
      profile,
      { collection: 'results', key: 'planets' },
      z.array(planetPositionSchema),
      () => this.deps.provider.getPlanets(profile.birth),
    );
  }

  /** GET /v1/profiles/{id}/chart?type= : houses plus the full planet table. */
  async chart(uid: string, profileId: string, type: ChartType): Promise<ChartResponse> {
    const profile = await this.deps.profiles.loadForReadings(uid, profileId);
    requireBirthTime(profile);
    const houses = await this.deps.cache.get(
      uid,
      profile,
      { collection: 'results', key: `chart_${type}` },
      z.array(chartHouseSchema).length(12),
      () => this.deps.provider.getChart(profile.birth, type),
    );
    const planets = await this.planets(uid, profile);
    return {
      profileId,
      type,
      houses: houses.data,
      planets: planets.data,
      fetchedAt: iso(houses.fetchedAt),
    };
  }

  /** GET /v1/profiles/{id}/planets : works without a birth time, masked accordingly. */
  async planetTable(uid: string, profileId: string): Promise<PlanetsResponse> {
    const profile = await this.deps.profiles.loadForReadings(uid, profileId);
    const planets = await this.planets(uid, profile);
    return {
      profileId,
      planets: profile.timeKnown ? planets.data : maskForUnknownTime(planets.data),
      timeAssumedNoon: profile.timeAssumedNoon,
      fetchedAt: iso(planets.fetchedAt),
    };
  }
}
