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
