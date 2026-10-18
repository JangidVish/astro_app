import type { BirthDate, BirthTime } from '@astro/shared';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

/** 330 -> "UTC+05:30", -210 -> "UTC−03:30" (true minus sign for screen readers and typography). */
export function formatUtcOffset(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** {1990,5,10} -> "10 May 1990" (unambiguous across locales, unlike 05/10/1990). */
export function formatBirthDate(d: BirthDate): string {
  return `${String(d.day)} ${MONTHS[d.month - 1] ?? '?'} ${String(d.year)}`;
}

/** 24-hour clock, as birth times are usually recorded. */
export function formatBirthTime(t: BirthTime): string {
  return `${pad(t.hour)}:${pad(t.minute)}`;
}

/** A picker Date read as wall-clock fields (pickers run in UTC so device time zone never shifts them). */
export function wallFromPickerDate(date: Date): { date: BirthDate; time: BirthTime } {
  return {
    date: { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() },
    time: { hour: date.getUTCHours(), minute: date.getUTCMinutes() },
  };
}

export function pickerDateFromWall(date: BirthDate, time: BirthTime | null): Date {
  return new Date(
    Date.UTC(date.year, date.month - 1, date.day, time?.hour ?? 12, time?.minute ?? 0),
  );
}

/** Value for an HTML date input ("YYYY-MM-DD"); used by the web build. */
export function dateInputValue(d: BirthDate | null): string {
  return d ? `${String(d.year).padStart(4, '0')}-${pad(d.month)}-${pad(d.day)}` : '';
}

/** Value for an HTML time input ("HH:MM"); used by the web build. */
export function timeInputValue(t: BirthTime | null): string {
  return t ? `${pad(t.hour)}:${pad(t.minute)}` : '';
}

function integers(value: string, separator: string, count: number): number[] | null {
  const parts = value.split(separator);
  if (parts.length !== count || parts.some((p) => p.length === 0)) return null;
  const numbers = parts.map(Number);
  return numbers.every(Number.isInteger) ? numbers : null;
}

/**
 * Reads an HTML date input's value as calendar fields, without going through Date, so the
 * browser's time zone cannot shift the day. Range checks stay with the form validation.
 */
export function birthDateFromInput(value: string): BirthDate | null {
  const n = integers(value, '-', 3);
  if (!n) return null;
  const [year = 0, month = 0, day = 0] = n;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** Reads an HTML time input's value ("HH:MM", or "HH:MM:SS" in some browsers). */
export function birthTimeFromInput(value: string): BirthTime | null {
  const n = integers(value, ':', 2) ?? integers(value, ':', 3);
  if (!n) return null;
  const [hour = -1, minute = -1] = n;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** Today's date in the device's calendar, for the date input's upper bound. */
export function todayInputValue(now: Date = new Date()): string {
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
