import { DateTime, IANAZone } from 'luxon';
import { timezoneIdSchema } from '../places.ts';

/**
 * Turns a local birth date/time at a place into a UTC instant, using the IANA tz database
 * bundled with the runtime (Node 24: tzdata 2025b). Pure: pass `now` for the future check.
 *
 * Handles:
 * - historical offsets (e.g. India's +06:30 war time, Nepal's switch to +05:45 in 1986);
 * - DST gaps: a local time that never happened (clocks jumped forward) -> status 'gap';
 * - DST overlaps: a local time that happened twice (clocks went back) -> status 'ambiguous'
 *   unless the caller says which occurrence (`offsetChoice`);
 * - unknown birth time: 12:00 local is assumed (FR-8).
 *
 * Offsets are rounded to whole minutes. Before standard time zones some places used local mean
 * time with seconds (Kolkata 1900: +05:21:10); rounding moves the instant by under 30 seconds.
 */
export interface BirthTimeInput {
  readonly date: { readonly year: number; readonly month: number; readonly day: number };
  /** null when the birth time is unknown. */
  readonly time: { readonly hour: number; readonly minute: number } | null;
  readonly timezoneId: string;
  readonly offsetChoice?: 'earlier' | 'later' | null;
}

export type BirthTimeResolution =
  | {
      readonly status: 'ok';
      readonly utcOffsetMinutes: number;
      /** ISO-8601 UTC, no milliseconds. */
      readonly instantUtc: string;
      readonly timeAssumedNoon: boolean;
    }
  | { readonly status: 'gap' }
  | {
      readonly status: 'ambiguous';
      /** Offsets of the first and second occurrence, in minutes. */
      readonly offsets: readonly [number, number];
    }
  | { readonly status: 'future' }
  | { readonly status: 'invalid_zone' };

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Exact offset (ms, may include seconds) of `zone` at a UTC instant. */
function offsetMsAt(zone: IANAZone, instantMs: number): number {
  return Math.round(zone.offset(instantMs) * MINUTE_MS);
}

/**
 * All UTC instants whose local wall-clock time in `zone` equals `wallMs` (the local fields
 * encoded as if they were UTC). 0 results = gap, 1 = normal, 2 = overlap.
 */
function instantsForWallTime(zone: IANAZone, wallMs: number): number[] {
  // Offsets in force within ±2 days cover any single transition, including whole-day skips.
  const candidateOffsets = new Set<number>();
  for (let h = -48; h <= 48; h += 6) candidateOffsets.add(offsetMsAt(zone, wallMs + h * HOUR_MS));

  const instants = new Set<number>();
  for (const offset of candidateOffsets) {
    const instant = wallMs - offset;
    if (offsetMsAt(zone, instant) === offset) instants.add(instant);
  }
  return [...instants].sort((a, b) => a - b);
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

/**
 * A real IANA zone in "Area/Location" form (or "UTC"). Bare abbreviations such as "IST" are
 * rejected even though some runtimes accept them: "IST" means India, Israel or Ireland.
 */
export function isValidTimezone(timezoneId: string): boolean {
  return timezoneIdSchema.safeParse(timezoneId).success && IANAZone.isValidZone(timezoneId);
}

export function resolveBirthTime(
  input: BirthTimeInput,
  now: Date = new Date(),
): BirthTimeResolution {
  if (!isValidTimezone(input.timezoneId)) return { status: 'invalid_zone' };
  const zone = IANAZone.create(input.timezoneId);

  const timeAssumedNoon = input.time === null;
  const { hour, minute } = input.time ?? { hour: 12, minute: 0 };
  const { year, month, day } = input.date;
  const wallMs = Date.UTC(year, month - 1, day, hour, minute);

  const instants = instantsForWallTime(zone, wallMs);
  let instant: number;
  if (instants.length === 0) {
    return { status: 'gap' };
  } else if (instants.length === 1) {
    instant = instants[0] ?? wallMs;
  } else {
    const [first = wallMs, second = wallMs] = instants;
    if (!input.offsetChoice) {
      const minutes = (ms: number) => Math.round((wallMs - ms) / MINUTE_MS);
      return { status: 'ambiguous', offsets: [minutes(first), minutes(second)] };
    }
    instant = input.offsetChoice === 'earlier' ? first : second;
  }

  // Future check: an unknown time is "today at the latest", so compare local dates instead.
  if (timeAssumedNoon) {
    const today = DateTime.fromJSDate(now, { zone });
    const birthDay = Date.UTC(year, month - 1, day);
    if (birthDay > Date.UTC(today.year, today.month - 1, today.day)) return { status: 'future' };
  } else if (instant > now.getTime()) {
    return { status: 'future' };
  }

  // Report the instant implied by the rounded offset: that is exactly what the provider receives
  // (local time + tzone), so the stored instant and the provider's calculation always agree.
  const utcOffsetMinutes = Math.round((wallMs - instant) / MINUTE_MS);
  return {
    status: 'ok',
    utcOffsetMinutes,
    instantUtc: toIso(wallMs - utcOffsetMinutes * MINUTE_MS),
    timeAssumedNoon,
  };
}
