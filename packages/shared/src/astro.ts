import { z } from 'zod';

/** The nine Vedic grahas. Rahu and Ketu are the lunar nodes. */
export const GRAHAS = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
] as const;
export const grahaSchema = z.enum(GRAHAS);
export type Graha = z.infer<typeof grahaSchema>;

/** Bodies shown in the planet table: the nine grahas plus the Lagna (ascendant). */
export const chartBodySchema = z.enum([...GRAHAS, 'Ascendant']);
export type ChartBody = z.infer<typeof chartBodySchema>;

/** Sidereal signs in zodiac order; index + 1 is the sign number used in charts. */
export const SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
] as const;
export const signSchema = z.enum(SIGNS);
export type Sign = z.infer<typeof signSchema>;

export const signNumberSchema = z.number().int().min(1).max(12);
export const houseNumberSchema = z.number().int().min(1).max(12);

export const CHART_TYPES = ['D1', 'D9'] as const;
export const chartTypeSchema = z.enum(CHART_TYPES);
export type ChartType = z.infer<typeof chartTypeSchema>;
