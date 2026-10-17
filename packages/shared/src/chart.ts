import { z } from 'zod';
import {
  chartBodySchema,
  chartTypeSchema,
  houseNumberSchema,
  signNumberSchema,
  signSchema,
} from './astro.js';
import { isoDateTime } from './common.js';

/** GET /v1/profiles/{id}/chart?type= */
export const chartQuerySchema = z.strictObject({ type: chartTypeSchema });

export const NAKSHATRA_PADA = z.number().int().min(1).max(4);

/**
 * One body's position. When the birth time is unknown (FR-8), time-sensitive fields are null:
 * the app shows sign and nakshatra only, with an accuracy disclaimer.
 */
export const planetPositionSchema = z.strictObject({
  body: chartBodySchema,
  sign: signSchema,
  signNumber: signNumberSchema,
  degreeInSign: z.number().min(0).lt(30).nullable(),
  fullDegree: z.number().min(0).lt(360).nullable(),
  nakshatra: z.string().min(1),
  nakshatraPada: NAKSHATRA_PADA.nullable(),
  house: houseNumberSchema.nullable(),
  isRetrograde: z.boolean(),
});
export type PlanetPosition = z.infer<typeof planetPositionSchema>;

/** A house in a North Indian chart: house 1 is the Lagna; signs rotate around it. */
export const chartHouseSchema = z.strictObject({
  house: houseNumberSchema,
  sign: signSchema,
  signNumber: signNumberSchema,
  bodies: z.array(chartBodySchema),
});
export type ChartHouse = z.infer<typeof chartHouseSchema>;

export const chartResponseSchema = z.strictObject({
  profileId: z.string(),
  type: chartTypeSchema,
  houses: z
    .array(chartHouseSchema)
    .length(12)
    .refine((houses) => houses.every((h, i) => h.house === i + 1), 'houses must be ordered 1..12'),
  planets: z.array(planetPositionSchema),
  fetchedAt: isoDateTime,
});
export type ChartResponse = z.infer<typeof chartResponseSchema>;

/** GET /v1/profiles/{id}/planets. Available even when the birth time is unknown (FR-8). */
export const planetsResponseSchema = z.strictObject({
  profileId: z.string(),
  planets: z.array(planetPositionSchema),
  timeAssumedNoon: z.boolean(),
  fetchedAt: isoDateTime,
});
export type PlanetsResponse = z.infer<typeof planetsResponseSchema>;
