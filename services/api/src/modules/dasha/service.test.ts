import { describe, expect, it } from 'vitest';
import type { DashaPeriod } from '@astro/shared';
import { currentPeriod } from './service.js';

const periods: DashaPeriod[] = [
  { lord: 'Ketu', start: '1988-08-23T13:24:00Z', end: '2007-08-24T07:24:00Z' },
  { lord: 'Venus', start: '2007-08-24T07:24:00Z', end: '2027-08-24T07:24:00Z' },
  { lord: 'Sun', start: '2027-08-24T07:24:00Z', end: '2033-08-24T13:24:00Z' },
];

describe('currentPeriod', () => {
  it.each([
    ['inside a period', '2026-10-17T12:00:00Z', 'Venus'],
    ['exactly at a start (inclusive)', '2007-08-24T07:24:00Z', 'Venus'],
    ['one ms before a boundary', '2007-08-24T07:23:59.999Z', 'Ketu'],
    ['exactly at an end belongs to the next period', '2027-08-24T07:24:00Z', 'Sun'],
    ['first instant of the first period', '1988-08-23T13:24:00Z', 'Ketu'],
  ])('%s -> %s', (_label, at, lord) => {
    expect(currentPeriod(periods, new Date(at))?.lord).toBe(lord);
  });

  it.each([
    ['before every period', '1980-01-01T00:00:00Z'],
    ['exactly at the last end', '2033-08-24T13:24:00Z'],
    ['after every period', '2100-01-01T00:00:00Z'],
  ])('%s -> null', (_label, at) => {
    expect(currentPeriod(periods, new Date(at))).toBeNull();
  });

  it('empty list -> null', () => {
    expect(currentPeriod([], new Date())).toBeNull();
  });
});
