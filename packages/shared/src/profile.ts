import { z } from 'zod';
import { isoDateTime, isValidCalendarDate, personName, toIsoDate } from './common.js';
import { MIN_BIRTH_YEAR, PROFILE_NAME_MAX } from './limits.js';
import { placeSchema } from './places.js';

/** Most-advanced UTC offset in use (UTC+14), so "today" anywhere is never past now + 14h. */
const MAX_UTC_OFFSET_MS = 14 * 60 * 60 * 1000;

/**
 * Local calendar date at the birthplace.
 *
 * DATE_IN_FUTURE here is a coarse check: it rejects dates that are in the future in every
 * time zone. The exact check (date + time at the birthplace's zone) runs on the server in T5.1.
 */
export const birthDateSchema = z
  .strictObject({
    year: z.number('INVALID_DATE').int('INVALID_DATE'),
    month: z
      .number('INVALID_DATE')
      .int('INVALID_DATE')
      .min(1, 'INVALID_DATE')
      .max(12, 'INVALID_DATE'),
    day: z
      .number('INVALID_DATE')
      .int('INVALID_DATE')
      .min(1, 'INVALID_DATE')
      .max(31, 'INVALID_DATE'),
  })
  .superRefine((d, ctx) => {
    if (!isValidCalendarDate(d.year, d.month, d.day)) {
      ctx.addIssue({ code: 'custom', message: 'INVALID_DATE' });
      return;
    }
    if (d.year < MIN_BIRTH_YEAR) {
      ctx.addIssue({ code: 'custom', message: 'DATE_OUT_OF_RANGE' });
      return;
    }
    const latestToday = toIsoDate(new Date(Date.now() + MAX_UTC_OFFSET_MS));
    const iso = `${String(d.year).padStart(4, '0')}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    if (iso > latestToday) ctx.addIssue({ code: 'custom', message: 'DATE_IN_FUTURE' });
  });
export type BirthDate = z.infer<typeof birthDateSchema>;

/** Local clock time at the birthplace. Seconds are not collected. */
export const birthTimeSchema = z.strictObject({
  hour: z.number('INVALID_TIME').int('INVALID_TIME').min(0, 'INVALID_TIME').max(23, 'INVALID_TIME'),
  minute: z
    .number('INVALID_TIME')
    .int('INVALID_TIME')
    .min(0, 'INVALID_TIME')
    .max(59, 'INVALID_TIME'),
});
export type BirthTime = z.infer<typeof birthTimeSchema>;

export const RELATIONS = ['self', 'partner', 'family', 'friend', 'other'] as const;
export const relationSchema = z.enum(RELATIONS, 'INVALID_RELATION');
export type Relation = z.infer<typeof relationSchema>;

/** Which occurrence of a repeated local time (DST fall-back) the user meant. */
export const offsetChoiceSchema = z.enum(['earlier', 'later']);
export type OffsetChoice = z.infer<typeof offsetChoiceSchema>;

export const profileNameSchema = personName(PROFILE_NAME_MAX);

/** Rule: timeKnown = true requires birthTime; timeKnown = false requires birthTime = null. */
function checkTimeState(
  value: { timeKnown?: boolean | undefined; birthTime?: BirthTime | null | undefined },
  ctx: z.RefinementCtx,
): void {
  const hasTime = value.birthTime !== null && value.birthTime !== undefined;
  if (value.timeKnown !== hasTime) {
    ctx.addIssue({ code: 'custom', message: 'TIME_STATE_MISMATCH', path: ['birthTime'] });
  }
}

/** POST /v1/profiles */
export const profileCreateInputSchema = z
  .strictObject({
    name: profileNameSchema,
    relation: relationSchema,
    birthDate: birthDateSchema,
    timeKnown: z.boolean(),
    birthTime: birthTimeSchema.nullable(),
    placeId: z
      .string('PLACE_NOT_RESOLVED')
      .min(1, 'PLACE_NOT_RESOLVED')
      .max(128, 'PLACE_NOT_RESOLVED'),
    offsetChoice: offsetChoiceSchema.nullable().optional(),
  })
  .superRefine(checkTimeState);
export type ProfileCreateInput = z.infer<typeof profileCreateInputSchema>;

/**
 * PATCH /v1/profiles/{id}. Partial update; at least one field.
 * `timeKnown` and `birthTime` must be sent together so the pair stays consistent.
 */
export const profileUpdateInputSchema = z
  .strictObject({
    name: profileNameSchema.optional(),
    relation: relationSchema.optional(),
    birthDate: birthDateSchema.optional(),
    timeKnown: z.boolean().optional(),
    birthTime: birthTimeSchema.nullable().optional(),
    placeId: z
      .string('PLACE_NOT_RESOLVED')
      .min(1, 'PLACE_NOT_RESOLVED')
      .max(128, 'PLACE_NOT_RESOLVED')
      .optional(),
    offsetChoice: offsetChoiceSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (Object.keys(value).length === 0) {
      ctx.addIssue({ code: 'custom', message: 'EMPTY_UPDATE' });
      return;
    }
    if (value.timeKnown !== undefined || value.birthTime !== undefined) {
      if (value.timeKnown === undefined || value.birthTime === undefined) {
        ctx.addIssue({ code: 'custom', message: 'TIME_STATE_MISMATCH', path: ['birthTime'] });
        return;
      }
      checkTimeState(value, ctx);
    }
  });
export type ProfileUpdateInput = z.infer<typeof profileUpdateInputSchema>;

/** Profile as returned by the API. */
export const profileSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  relation: relationSchema,
  birthDate: z.strictObject({ year: z.number(), month: z.number(), day: z.number() }),
  timeKnown: z.boolean(),
  birthTime: birthTimeSchema.nullable(),
  place: placeSchema,
  utcOffsetMinutes: z.number().int(),
  offsetChoice: offsetChoiceSchema.nullable(),
  /** True when the birth time is unknown and 12:00 local was assumed (FR-8). */
  timeAssumedNoon: z.boolean(),
  isPrimary: z.boolean(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Profile = z.infer<typeof profileSchema>;

export const profileListResponseSchema = z.strictObject({
  profiles: z.array(profileSchema),
});
export type ProfileListResponse = z.infer<typeof profileListResponseSchema>;
