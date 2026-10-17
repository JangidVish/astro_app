import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toValidationDetails, type ErrorCode } from './errors.js';
import {
  birthDateSchema,
  birthTimeSchema,
  profileCreateInputSchema,
  profileNameSchema,
  profileUpdateInputSchema,
} from './profile.js';
import type { z } from 'zod';

/** Fixed clock: 2026-10-17 12:00 UTC. */
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

const validCreate = {
  name: 'Asha Rao',
  relation: 'self',
  birthDate: { year: 1990, month: 5, day: 10 },
  timeKnown: true,
  birthTime: { hour: 19, minute: 55 },
  placeId: 'pl_mumbai_1',
};

describe('birthDateSchema', () => {
  it.each([
    ['ordinary date', { year: 1990, month: 5, day: 10 }],
    ['leap day in leap year', { year: 2000, month: 2, day: 29 }],
    ['lower bound 1900-01-01', { year: 1900, month: 1, day: 1 }],
    ['31st of a 31-day month', { year: 1999, month: 12, day: 31 }],
    ['today (UTC)', { year: 2026, month: 10, day: 17 }],
    ['tomorrow UTC = already today in UTC+14 zones', { year: 2026, month: 10, day: 18 }],
  ])('accepts %s', (_label, input) => {
    expect(codes(birthDateSchema, input)).toEqual([]);
  });

  it.each<[string, unknown, ErrorCode]>([
    ['29 Feb in a non-leap year', { year: 2001, month: 2, day: 29 }, 'INVALID_DATE'],
    ['29 Feb 1900 (century, not leap)', { year: 1900, month: 2, day: 29 }, 'INVALID_DATE'],
    ['31 April', { year: 1990, month: 4, day: 31 }, 'INVALID_DATE'],
    ['month 13', { year: 1990, month: 13, day: 1 }, 'INVALID_DATE'],
    ['month 0', { year: 1990, month: 0, day: 1 }, 'INVALID_DATE'],
    ['day 0', { year: 1990, month: 1, day: 0 }, 'INVALID_DATE'],
    ['fractional day', { year: 1990, month: 1, day: 1.5 }, 'INVALID_DATE'],
    ['string number', { year: '1990', month: 1, day: 1 }, 'INVALID_DATE'],
    ['before 1900', { year: 1899, month: 12, day: 31 }, 'DATE_OUT_OF_RANGE'],
    ['future everywhere (UTC +2 days)', { year: 2026, month: 10, day: 19 }, 'DATE_IN_FUTURE'],
    ['far future', { year: 2100, month: 1, day: 1 }, 'DATE_IN_FUTURE'],
  ])('rejects %s', (_label, input, expected) => {
    expect(codes(birthDateSchema, input)).toContain(expected);
  });

  it('rejects unknown fields', () => {
    expect(codes(birthDateSchema, { year: 1990, month: 1, day: 1, era: 'CE' })).toContain(
      'UNKNOWN_FIELD',
    );
  });
});

describe('birthTimeSchema', () => {
  it.each([
    ['midnight', { hour: 0, minute: 0 }],
    ['last minute of day', { hour: 23, minute: 59 }],
  ])('accepts %s', (_label, input) => {
    expect(codes(birthTimeSchema, input)).toEqual([]);
  });

  it.each([
    ['hour 24', { hour: 24, minute: 0 }],
    ['minute 60', { hour: 10, minute: 60 }],
    ['negative hour', { hour: -1, minute: 0 }],
    ['decimal hour', { hour: 10.5, minute: 0 }],
    ['string minute', { hour: 10, minute: '05' }],
    ['NaN', { hour: Number.NaN, minute: 0 }],
  ])('rejects %s', (_label, input) => {
    expect(codes(birthTimeSchema, input)).toContain('INVALID_TIME');
  });
});

describe('profileNameSchema', () => {
  it.each([
    ['plain ASCII', 'Asha Rao', 'Asha Rao'],
    ['Devanagari with combining marks', 'आशा राव', 'आशा राव'],
    ['Devanagari with ZWJ (explicit U+200D)', 'लक्\u200Dष्मी', 'लक्\u200Dष्मी'],
    ['Tamil', 'முருகன்', 'முருகன்'],
    ['accented Latin', 'José Ñúñez', 'José Ñúñez'],
    ['hyphen, period and apostrophes', "Mary-Jane O'Neil Jr.", "Mary-Jane O'Neil Jr."],
    ['curly apostrophe', 'D’Souza', 'D’Souza'],
    ['trims and collapses whitespace', '  Asha    Rao  ', 'Asha Rao'],
    ['exactly 60 code points', 'a'.repeat(60), 'a'.repeat(60)],
  ])('accepts %s', (_label, input, normalized) => {
    const result = profileNameSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data).toBe(normalized);
  });

  it('normalizes NFD to NFC so the same name is stored identically', () => {
    const nfd = 'Jose\u0301'; // e + combining acute
    expect(profileNameSchema.parse(nfd)).toBe('Jos\u00e9');
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['61 code points', 'a'.repeat(61)],
    ['digits', 'Agent 007'],
    ['emoji', 'Asha 🌙'],
    ['HTML/script characters', '<script>'],
    ['newline control character', 'Asha\nRao'],
    ['null byte', 'Asha\u0000'],
    ['bidi override (spoofing)', 'Asha\u202eoaR'],
    ['punctuation only', "-.'"],
    ['non-string', 42],
  ])('rejects %s', (_label, input) => {
    expect(codes(profileNameSchema, input)).toContain('INVALID_NAME');
  });
});

describe('profileCreateInputSchema', () => {
  it('accepts a complete profile with known time', () => {
    expect(codes(profileCreateInputSchema, validCreate)).toEqual([]);
  });

  it('accepts unknown time with birthTime null', () => {
    expect(
      codes(profileCreateInputSchema, { ...validCreate, timeKnown: false, birthTime: null }),
    ).toEqual([]);
  });

  it('accepts an explicit DST offset choice', () => {
    expect(codes(profileCreateInputSchema, { ...validCreate, offsetChoice: 'later' })).toEqual([]);
  });

  it.each<[string, Record<string, unknown>, ErrorCode]>([
    ['time known but birthTime null', { birthTime: null }, 'TIME_STATE_MISMATCH'],
    [
      'time unknown but birthTime given',
      { timeKnown: false, birthTime: { hour: 1, minute: 0 } },
      'TIME_STATE_MISMATCH',
    ],
    ['empty placeId', { placeId: '' }, 'PLACE_NOT_RESOLVED'],
    ['missing placeId', { placeId: undefined }, 'PLACE_NOT_RESOLVED'],
    ['unknown relation', { relation: 'boss' }, 'INVALID_RELATION'],
    ['bad offset choice', { offsetChoice: 'middle' }, 'VALIDATION_FAILED'],
  ])('rejects %s', (_label, patch, expected) => {
    expect(codes(profileCreateInputSchema, { ...validCreate, ...patch })).toContain(expected);
  });

  it('rejects injected extra fields such as an owner uid', () => {
    expect(codes(profileCreateInputSchema, { ...validCreate, uid: 'someone-else' })).toContain(
      'UNKNOWN_FIELD',
    );
  });

  it('rejects raw coordinates: places must come from search (placeId only)', () => {
    expect(codes(profileCreateInputSchema, { ...validCreate, lat: 19.07, lon: 72.88 })).toContain(
      'UNKNOWN_FIELD',
    );
  });

  it('reports nested paths for field errors', () => {
    const result = profileCreateInputSchema.safeParse({
      ...validCreate,
      birthTime: { hour: 25, minute: 0 },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toValidationDetails(result.error)).toContainEqual({
        path: 'birthTime.hour',
        code: 'INVALID_TIME',
      });
    }
  });
});

describe('profileUpdateInputSchema', () => {
  it('accepts a name-only update', () => {
    expect(codes(profileUpdateInputSchema, { name: 'New Name' })).toEqual([]);
  });

  it('accepts switching to unknown time when both fields are sent', () => {
    expect(codes(profileUpdateInputSchema, { timeKnown: false, birthTime: null })).toEqual([]);
  });

  it('rejects an empty update', () => {
    expect(codes(profileUpdateInputSchema, {})).toContain('EMPTY_UPDATE');
  });

  it.each([
    ['timeKnown without birthTime', { timeKnown: true }],
    ['birthTime without timeKnown', { birthTime: { hour: 5, minute: 0 } }],
    ['inconsistent pair', { timeKnown: true, birthTime: null }],
  ])('rejects %s', (_label, input) => {
    expect(codes(profileUpdateInputSchema, input)).toContain('TIME_STATE_MISMATCH');
  });
});
