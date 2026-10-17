import { z } from 'zod';
import { daysBetween, isoDate, isoDateTime, toIsoDate } from './common.ts';
import { PREDICTION_DATE_WINDOW_DAYS } from './limits.ts';

/**
 * GET /v1/profiles/{id}/prediction?date=yyyy-mm-dd
 * `date` is a calendar date in the user's time zone. It must be within PREDICTION_DATE_WINDOW_DAYS
 * of the server's UTC date: enough for every zone's yesterday/today/tomorrow, no open-ended lookups.
 */
export const predictionQuerySchema = z.strictObject({
  date: isoDate.refine(
    (date) => Math.abs(daysBetween(toIsoDate(new Date()), date)) <= PREDICTION_DATE_WINDOW_DAYS,
    'PREDICTION_DATE_OUT_OF_RANGE',
  ),
});
export type PredictionQuery = z.infer<typeof predictionQuerySchema>;

export const predictionSectionsSchema = z.strictObject({
  health: z.string(),
  emotions: z.string(),
  profession: z.string(),
  luck: z.string(),
  personalLife: z.string(),
  travel: z.string(),
});

export const predictionResponseSchema = z.strictObject({
  profileId: z.string(),
  date: isoDate,
  /** The Moon sign and nakshatra the provider used (FR-17). */
  moonSign: z.string(),
  nakshatra: z.string(),
  sections: predictionSectionsSchema,
  timeAssumedNoon: z.boolean(),
  fetchedAt: isoDateTime,
});
export type PredictionResponse = z.infer<typeof predictionResponseSchema>;
