import { z } from 'zod';
import { grahaSchema } from './astro.ts';
import { isoDateTime } from './common.ts';

/** GET /v1/profiles/{id}/dasha/{md}: path parameter. */
export const dashaParamsSchema = z.strictObject({ md: grahaSchema });

/** A Vimshottari period. Instants are UTC; the app formats them in the user's time zone. */
export const dashaPeriodSchema = z
  .strictObject({
    lord: grahaSchema,
    start: isoDateTime,
    end: isoDateTime,
  })
  .refine((p) => Date.parse(p.start) < Date.parse(p.end), 'period start must be before end');
export type DashaPeriod = z.infer<typeof dashaPeriodSchema>;

/** GET /v1/profiles/{id}/dasha */
export const mahadashaResponseSchema = z.strictObject({
  profileId: z.string(),
  mahadashas: z.array(dashaPeriodSchema),
  /** Period containing "now", derived from the cached provider periods (data-model 2.3). */
  current: z
    .strictObject({
      mahadasha: grahaSchema,
      antardasha: grahaSchema.nullable(),
    })
    .nullable(),
  fetchedAt: isoDateTime,
});
export type MahadashaResponse = z.infer<typeof mahadashaResponseSchema>;

/** GET /v1/profiles/{id}/dasha/{md} */
export const antardashaResponseSchema = z.strictObject({
  profileId: z.string(),
  mahadasha: grahaSchema,
  antardashas: z.array(dashaPeriodSchema),
  fetchedAt: isoDateTime,
});
export type AntardashaResponse = z.infer<typeof antardashaResponseSchema>;
