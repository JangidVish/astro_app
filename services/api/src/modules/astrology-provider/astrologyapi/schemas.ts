// Raw AstrologyAPI response shapes, from the documented samples in
// test/fixtures/provider/astrologyapi/*.sample.json. Objects are not strict: the provider may add
// fields. Every field we read is validated here; nothing else in the app sees these shapes.
import { z } from 'zod';

/** Numbers sometimes arrive as strings (e.g. geo_details longitude: "72.88261"). */
const looseNumber = z
  .union([
    z.number(),
    z
      .string()
      .regex(/^-?\d+(?:\.\d+)?$/)
      .transform(Number),
  ])
  .refine(Number.isFinite, 'not a finite number');

/** Booleans arrive as "true"/"false" strings for planets and as real booleans for the Ascendant. */
const looseBoolean = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((v) => v === 'true'),
]);

const nonEmpty = z.string().trim().min(1);

export const geoDetailsSchema = z.object({
  geonames: z.array(
    z.object({
      place_name: nonEmpty,
      latitude: looseNumber,
      longitude: looseNumber,
      timezone_id: nonEmpty,
      country_code: z.string().regex(/^[A-Za-z]{2}$/),
    }),
  ),
});

export const timezoneWithDstSchema = z.object({
  timezone: looseNumber,
});

export const birthDetailsSchema = z.object({
  ayanamsha: looseNumber,
});

export const planetsSchema = z.array(
  z.object({
    name: nonEmpty,
    fullDegree: looseNumber,
    normDegree: looseNumber,
    isRetro: looseBoolean,
    sign: nonEmpty,
    nakshatra: nonEmpty,
    nakshatra_pad: looseNumber,
    house: looseNumber,
  }),
);

export const horoChartSchema = z.array(
  z.object({
    sign: looseNumber,
    sign_name: nonEmpty,
    planet: z.array(z.string()),
  }),
);

/**
 * Dates look like "2-5-2021 8:7" (day-month-year hour:minute, no zero padding). The live API
 * separates date and time with two spaces ("23-8-1988  18:54") while the docs show one, so any
 * run of whitespace is accepted. Times are in the request's `tzone` (verified live, T3.4).
 */
export const DASHA_DATE = /^(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{1,2})$/;

export const dashaSchema = z.array(
  z.object({
    planet: nonEmpty,
    start: z.string().regex(DASHA_DATE),
    end: z.string().regex(DASHA_DATE),
  }),
);

export const dailyNakshatraPredictionSchema = z.object({
  birth_moon_sign: nonEmpty,
  birth_moon_nakshatra: nonEmpty,
  /** e.g. "7 July 2017": the day the prediction is for. */
  prediction_date: z.string().regex(/^\d{1,2} [A-Za-z]+ \d{4}$/),
  prediction: z.object({
    health: nonEmpty,
    emotions: nonEmpty,
    profession: nonEmpty,
    luck: nonEmpty,
    personal_life: nonEmpty,
    travel: nonEmpty,
  }),
});
