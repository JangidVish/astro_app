import { z } from 'zod';

/** True when year/month/day form a real Gregorian calendar date (e.g. rejects 2001-02-29). */
export function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** `yyyy-mm-dd` for a UTC instant. */
export function toIsoDate(instant: Date): string {
  return instant.toISOString().slice(0, 10);
}

/** Whole days between two `yyyy-mm-dd` strings (b - a). Both must be valid ISO dates. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Length in Unicode code points, so combining marks and astral characters count as written. */
export function codePointLength(text: string): number {
  let count = 0;
  for (const _codePoint of text) count += 1;
  return count;
}

/** Control characters, including C1 and bidi overrides that can disguise text. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;

/**
 * Letters and combining marks from any script, plus space, period, apostrophes, hyphen,
 * and ZWNJ/ZWJ (U+200C/U+200D), which Indic scripts such as Devanagari need for correct shaping.
 */
const NAME_ALLOWED = /^(?:[\p{L}\p{M} .'\u2019-]|\u200c|\u200d)+$/u;
const HAS_LETTER = /\p{L}/u;

/**
 * Person-name schema: NFC-normalizes, trims, collapses inner whitespace, then validates.
 * Length is counted in code points so combining marks are not under-counted.
 */
export function personName(maxLength: number) {
  return z
    .string('INVALID_NAME')
    .refine((raw) => !CONTROL_CHARS.test(raw), 'INVALID_NAME')
    .transform((raw) => raw.normalize('NFC').trim().replace(/\s+/gu, ' '))
    .refine((name) => {
      const length = codePointLength(name);
      return length >= 1 && length <= maxLength;
    }, 'INVALID_NAME')
    .refine((name) => NAME_ALLOWED.test(name) && HAS_LETTER.test(name), 'INVALID_NAME');
}

/** ISO-8601 UTC timestamp string as sent in API responses. */
export const isoDateTime = z.iso.datetime({ offset: false });

/** `yyyy-mm-dd`, real calendar date. */
export const isoDate = z.iso.date('INVALID_DATE');
