import { z } from 'zod';
import { codePointLength } from './common.ts';
import { PLACE_QUERY_MAX, PLACE_QUERY_MIN } from './limits.ts';

/** GET /v1/places?q= */
export const placeSearchQuerySchema = z.strictObject({
  q: z
    .string('QUERY_TOO_SHORT')
    .transform((q) => q.normalize('NFC').trim().replace(/\s+/gu, ' '))
    .refine((q) => codePointLength(q) >= PLACE_QUERY_MIN, 'QUERY_TOO_SHORT')
    .refine((q) => codePointLength(q) <= PLACE_QUERY_MAX, 'QUERY_TOO_LONG'),
});
export type PlaceSearchQuery = z.infer<typeof placeSearchQuerySchema>;

/**
 * Coarse IANA zone-name format check ("Area/Location", or "UTC").
 * Whether the zone actually exists is verified with the tz database in T5.1.
 */
const IANA_ZONE_FORMAT = /^(?:UTC|[A-Za-z]+(?:\/[A-Za-z0-9_+-]+)+)$/;

export const latitudeSchema = z
  .number('INVALID_COORDINATES')
  .refine(Number.isFinite, 'INVALID_COORDINATES')
  .refine((v) => v >= -90 && v <= 90, 'INVALID_COORDINATES');

export const longitudeSchema = z
  .number('INVALID_COORDINATES')
  .refine(Number.isFinite, 'INVALID_COORDINATES')
  .refine((v) => v >= -180 && v <= 180, 'INVALID_COORDINATES');

export const timezoneIdSchema = z
  .string('INVALID_TIMEZONE')
  .regex(IANA_ZONE_FORMAT, 'INVALID_TIMEZONE');

/** A resolved place. `placeId` is opaque; profiles reference places only by this ID. */
export const placeSchema = z.strictObject({
  placeId: z.string().min(1).max(128),
  name: z.string().min(1).max(200),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  lat: latitudeSchema,
  lon: longitudeSchema,
  timezoneId: timezoneIdSchema,
});
export type Place = z.infer<typeof placeSchema>;

export const placeSearchResponseSchema = z.strictObject({
  places: z.array(placeSchema),
});
export type PlaceSearchResponse = z.infer<typeof placeSearchResponseSchema>;
