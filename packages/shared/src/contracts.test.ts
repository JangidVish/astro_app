import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { chartResponseSchema } from './chart.js';
import { isValidCalendarDate, daysBetween } from './common.js';
import { dashaParamsSchema, dashaPeriodSchema } from './dasha.js';
import { apiErrorSchema, ERROR_CODES, toValidationDetails, type ErrorCode } from './errors.js';
import { meUpdateInputSchema } from './me.js';
import { placeSchema, placeSearchQuerySchema } from './places.js';
import { predictionQuerySchema } from './prediction.js';
import { SIGNS } from './astro.js';

const NOW = new Date('2026-10-17T12:00:00Z');
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

function codes(schema: z.ZodType, input: unknown): ErrorCode[] {
  const result = schema.safeParse(input);
  return result.success ? [] : toValidationDetails(result.error).map((d) => d.code);
}

describe('error codes', () => {
  it('are unique', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it('error body schema accepts the documented shape and rejects unknown codes', () => {
    const body = { error: { code: 'NOT_FOUND', message: 'Not found', retryable: false } };
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
    expect(
      apiErrorSchema.safeParse({ error: { ...body.error, code: 'SOMETHING_NEW' } }).success,
    ).toBe(false);
  });
});

describe('calendar helpers', () => {
  it.each([
    [2000, 2, 29, true],
    [1900, 2, 29, false],
    [2024, 2, 29, true],
    [2023, 2, 29, false],
    [2023, 6, 31, false],
  ])('isValidCalendarDate(%i-%i-%i) = %s', (y, m, d, expected) => {
    expect(isValidCalendarDate(y, m, d)).toBe(expected);
  });

  it('daysBetween counts across month and year boundaries', () => {
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2024-03-01', '2024-02-28')).toBe(-2);
  });
});

describe('placeSearchQuerySchema', () => {
  it('trims and accepts 3+ characters, including non-Latin', () => {
    expect(placeSearchQuerySchema.parse({ q: '  mum ' }).q).toBe('mum');
    expect(codes(placeSearchQuerySchema, { q: 'पुणे' })).toEqual([]);
  });

  it.each([
    ['2 characters', { q: 'mu' }, 'QUERY_TOO_SHORT'],
    ['spaces padding a short query', { q: '  ab  ' }, 'QUERY_TOO_SHORT'],
    ['101 characters', { q: 'a'.repeat(101) }, 'QUERY_TOO_LONG'],
  ] as const)('rejects %s', (_label, input, expected) => {
    expect(codes(placeSearchQuerySchema, input)).toContain(expected);
  });
});

describe('placeSchema', () => {
  const mumbai = {
    placeId: 'pl_1',
    name: 'Mumbai',
    countryCode: 'IN',
    lat: 19.0728,
    lon: 72.8826,
    timezoneId: 'Asia/Kolkata',
  };

  it('accepts a valid place, including multi-part zones', () => {
    expect(codes(placeSchema, mumbai)).toEqual([]);
    expect(codes(placeSchema, { ...mumbai, timezoneId: 'America/Argentina/Buenos_Aires' })).toEqual(
      [],
    );
  });

  it.each<[string, Record<string, unknown>, ErrorCode]>([
    ['latitude above 90', { lat: 90.0001 }, 'INVALID_COORDINATES'],
    ['longitude below -180', { lon: -180.5 }, 'INVALID_COORDINATES'],
    ['NaN latitude', { lat: Number.NaN }, 'INVALID_COORDINATES'],
    ['Infinity longitude', { lon: Number.POSITIVE_INFINITY }, 'INVALID_COORDINATES'],
    [
      'string latitude (provider quirk must be coerced upstream)',
      { lat: '19.07' },
      'INVALID_COORDINATES',
    ],
    ['malformed zone', { timezoneId: 'IST' }, 'INVALID_TIMEZONE'],
    ['zone with path traversal', { timezoneId: '../etc/passwd' }, 'INVALID_TIMEZONE'],
  ])('rejects %s', (_label, patch, expected) => {
    expect(codes(placeSchema, { ...mumbai, ...patch })).toContain(expected);
  });
});

describe('predictionQuerySchema (server UTC date 2026-10-17)', () => {
  it.each(['2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19'])(
    'accepts %s (within ±2 days)',
    (date) => {
      expect(codes(predictionQuerySchema, { date })).toEqual([]);
    },
  );

  it.each([
    ['3 days back', '2026-10-14', 'PREDICTION_DATE_OUT_OF_RANGE'],
    ['3 days ahead', '2026-10-20', 'PREDICTION_DATE_OUT_OF_RANGE'],
    ['impossible date', '2026-02-30', 'INVALID_DATE'],
    ['wrong format', '17-10-2026', 'INVALID_DATE'],
  ] as const)('rejects %s', (_label, date, expected) => {
    expect(codes(predictionQuerySchema, { date })).toContain(expected);
  });
});

describe('meUpdateInputSchema', () => {
  it('accepts consent acceptance and display-name changes', () => {
    expect(
      codes(meUpdateInputSchema, {
        acceptConsent: { privacyVersion: '2026-10-01', termsVersion: '2026-10-01' },
      }),
    ).toEqual([]);
    expect(codes(meUpdateInputSchema, { displayName: null })).toEqual([]);
  });

  it('rejects empty updates and bad names', () => {
    expect(codes(meUpdateInputSchema, {})).toContain('EMPTY_UPDATE');
    expect(codes(meUpdateInputSchema, { displayName: 'x'.repeat(51) })).toContain('INVALID_NAME');
  });
});

describe('dasha contracts', () => {
  it('accepts only real graha names as the Mahadasha path parameter', () => {
    expect(dashaParamsSchema.safeParse({ md: 'Venus' }).success).toBe(true);
    expect(dashaParamsSchema.safeParse({ md: 'Pluto' }).success).toBe(false);
    expect(dashaParamsSchema.safeParse({ md: 'venus' }).success).toBe(false);
  });

  it('rejects a period whose end is not after its start', () => {
    const period = { lord: 'Sun', start: '2027-05-02T14:37:00Z', end: '2021-05-02T02:37:00Z' };
    expect(dashaPeriodSchema.safeParse(period).success).toBe(false);
  });
});

describe('chartResponseSchema', () => {
  const houses = SIGNS.map((sign, i) => ({
    house: i + 1,
    sign,
    signNumber: i + 1,
    bodies: [],
  }));
  const chart = {
    profileId: 'p1',
    type: 'D1',
    houses,
    planets: [],
    fetchedAt: '2026-10-17T12:00:00Z',
  };

  it('accepts 12 ordered houses', () => {
    expect(chartResponseSchema.safeParse(chart).success).toBe(true);
  });

  it('rejects 11 houses or out-of-order houses', () => {
    expect(chartResponseSchema.safeParse({ ...chart, houses: houses.slice(0, 11) }).success).toBe(
      false,
    );
    const swapped = [houses[1], houses[0], ...houses.slice(2)];
    expect(chartResponseSchema.safeParse({ ...chart, houses: swapped }).success).toBe(false);
  });
});
