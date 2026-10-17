import { z } from 'zod';
import { daysBetween, toIsoDate, type PredictionResponse } from '@astro/shared';
import { AppError } from '../../common/errors.js';
import { ProviderError } from '../astrology-provider/errors.js';
import type {
  AstrologyProvider,
  DailyPrediction,
  PredictionDay,
} from '../astrology-provider/provider.js';
import type { ProfilesService } from '../birth-profiles/service.js';
import type { ReadingsCache } from '../readings/cache.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Predictions are kept 90 days after their date (data-model 2.4), then removed by TTL. */
const PREDICTION_RETENTION_MS = 90 * DAY_MS;

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

const dailyPredictionSchema = z.object({
  forDate: z.string(),
  moonSign: z.string(),
  nakshatra: z.string(),
  sections: z.object({
    health: z.string(),
    emotions: z.string(),
    profession: z.string(),
    luck: z.string(),
    personalLife: z.string(),
    travel: z.string(),
  }),
});

const DAY_BY_OFFSET: Record<number, PredictionDay> = { [-1]: 'previous', 0: 'today', 1: 'next' };

export interface PredictionsDeps {
  profiles: ProfilesService;
  provider: AstrologyProvider;
  cache: ReadingsCache;
  now?: () => Date;
}

export class PredictionsService {
  private readonly now: () => Date;

  constructor(private readonly deps: PredictionsDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * GET /v1/profiles/{id}/prediction?date= (FR-16).
   * The provider's "today" is the date at the birth place (request tzone; verified live in T3.4),
   * so the requested date is mapped to previous/today/next relative to that.
   */
  async daily(uid: string, profileId: string, date: string): Promise<PredictionResponse> {
    const profile = await this.deps.profiles.loadForReadings(uid, profileId);
    const birthPlaceToday = toIsoDate(
      new Date(this.now().getTime() + profile.birth.utcOffsetMinutes * 60_000),
    );
    const day = DAY_BY_OFFSET[daysBetween(birthPlaceToday, date)];
    if (!day) {
      throw new AppError(
        'VALIDATION_FAILED',
        400,
        'Predictions are available for yesterday, today and tomorrow',
        {
          details: [{ path: 'date', code: 'PREDICTION_DATE_OUT_OF_RANGE' }],
        },
      );
    }

    const reading = await this.deps.cache.get<DailyPrediction>(
      uid,
      profile,
      {
        collection: 'predictions',
        key: date,
        expireAt: new Date(Date.parse(`${date}T00:00:00Z`) + PREDICTION_RETENTION_MS),
      },
      dailyPredictionSchema,
      async () => {
        const result = await this.deps.provider.getDailyPrediction(profile.birth, day);
        // Near midnight our idea of "today" and the provider's can differ; never store a reading
        // under the wrong date.
        if (result.data.forDate !== date) throw new ProviderError('malformed', result.endpoint);
        return result;
      },
    );

    const p = reading.data;
    return {
      profileId,
      date,
      moonSign: p.moonSign,
      nakshatra: p.nakshatra,
      sections: p.sections,
      timeAssumedNoon: profile.timeAssumedNoon,
      fetchedAt: iso(reading.fetchedAt),
    };
  }
}
