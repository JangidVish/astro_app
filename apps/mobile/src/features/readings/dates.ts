import type { DashaPeriod } from '@astro/shared';

/** "2 May 2021" in the device's time zone (dasha instants are UTC from the API). */
export function formatInstant(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Whether `at` falls inside the period (start inclusive, end exclusive, like the server). */
export function isCurrent(period: DashaPeriod, at: Date): boolean {
  const t = at.getTime();
  return Date.parse(period.start) <= t && t < Date.parse(period.end);
}

/** Length of a period in years, one decimal ("6.0 years"). */
export function periodYears(period: DashaPeriod): string {
  const years =
    (Date.parse(period.end) - Date.parse(period.start)) / (365.25 * 24 * 60 * 60 * 1000);
  return `${years.toFixed(1)} years`;
}

/** The device's local calendar date, shifted by whole days, as yyyy-mm-dd. */
export function localIsoDate(now: Date, offsetDays: number): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
