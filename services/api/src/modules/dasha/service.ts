import { z } from 'zod';
import {
  dashaPeriodSchema,
  type AntardashaResponse,
  type DashaPeriod,
  type Graha,
  type MahadashaResponse,
} from '@astro/shared';
import type { AstrologyProvider } from '../astrology-provider/provider.js';
import type { ProfileForReadings, ProfilesService } from '../birth-profiles/service.js';
import { requireBirthTime, type CachedReading, type ReadingsCache } from '../readings/cache.js';

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const periodsSchema = z.array(dashaPeriodSchema);

/**
 * The period containing `at` (start inclusive, end exclusive), or null if `at` is outside them all.
 * A date lookup over provider data, not an astrological calculation (data-model 2.3).
 */
export function currentPeriod(periods: readonly DashaPeriod[], at: Date): DashaPeriod | null {
  const t = at.getTime();
  return periods.find((p) => Date.parse(p.start) <= t && t < Date.parse(p.end)) ?? null;
}

export interface DashaDeps {
  profiles: ProfilesService;
  provider: AstrologyProvider;
  cache: ReadingsCache;
  now?: () => Date;
}

export class DashaService {
  private readonly now: () => Date;

  constructor(private readonly deps: DashaDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private major(uid: string, profile: ProfileForReadings): Promise<CachedReading<DashaPeriod[]>> {
    return this.deps.cache.get(
      uid,
      profile,
      { collection: 'results', key: 'dasha_major' },
      periodsSchema,
      () => this.deps.provider.getMajorDasha(profile.birth),
    );
  }

  private sub(
    uid: string,
    profile: ProfileForReadings,
    md: Graha,
  ): Promise<CachedReading<DashaPeriod[]>> {
    return this.deps.cache.get(
      uid,
      profile,
      { collection: 'results', key: `dasha_sub_${md}` },
      periodsSchema,
      () => this.deps.provider.getSubDasha(profile.birth, md),
    );
  }

  /** GET /v1/profiles/{id}/dasha */
  async mahadashas(uid: string, profileId: string): Promise<MahadashaResponse> {
    const profile = await this.deps.profiles.loadForReadings(uid, profileId);
    requireBirthTime(profile);
    const major = await this.major(uid, profile);
    const at = this.now();
    const md = currentPeriod(major.data, at);
    const ad = md ? currentPeriod((await this.sub(uid, profile, md.lord)).data, at) : null;
    return {
      profileId,
      mahadashas: major.data,
      current: md ? { mahadasha: md.lord, antardasha: ad?.lord ?? null } : null,
      fetchedAt: iso(major.fetchedAt),
    };
  }

  /** GET /v1/profiles/{id}/dasha/{md} */
  async antardashas(uid: string, profileId: string, md: Graha): Promise<AntardashaResponse> {
    const profile = await this.deps.profiles.loadForReadings(uid, profileId);
    requireBirthTime(profile);
    const sub = await this.sub(uid, profile, md);
    return { profileId, mahadasha: md, antardashas: sub.data, fetchedAt: iso(sub.fetchedAt) };
  }
}
