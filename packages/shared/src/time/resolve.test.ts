import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isValidTimezone, resolveBirthTime, type BirthTimeInput } from './resolve.ts';

interface TzCase {
  id: string;
  zone: string;
  date: string;
  time: string | null;
  offsetChoice?: 'earlier' | 'later';
  expect: {
    status: string;
    offset?: number;
    offsets?: [number, number];
    instant?: string;
    timeAssumedNoon?: boolean;
  };
  source: string;
}

const fixture = JSON.parse(
  readFileSync(new URL('../../test/fixtures/tz-cases.json', import.meta.url), 'utf8'),
) as { now: string; cases: TzCase[] };
const NOW = new Date(fixture.now);

function toInput(c: {
  zone: string;
  date: string;
  time: string | null;
  offsetChoice?: 'earlier' | 'later';
}): BirthTimeInput {
  const [year = 0, month = 0, day = 0] = c.date.split('-').map(Number);
  const time =
    c.time === null
      ? null
      : (([hour = 0, minute = 0]) => ({ hour, minute }))(c.time.split(':').map(Number));
  return {
    date: { year, month, day },
    time,
    timezoneId: c.zone,
    offsetChoice: c.offsetChoice ?? null,
  };
}

describe('resolveBirthTime: tz database cases', () => {
  it('has at least 20 documented cases', () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(20);
    for (const c of fixture.cases) expect(c.source.length).toBeGreaterThan(5);
  });

  it.each(fixture.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const result = resolveBirthTime(toInput(c), NOW);
    expect(result.status).toBe(c.expect.status);
    if (result.status === 'ok') {
      if (c.expect.offset !== undefined) expect(result.utcOffsetMinutes).toBe(c.expect.offset);
      if (c.expect.instant !== undefined) expect(result.instantUtc).toBe(c.expect.instant);
      expect(result.timeAssumedNoon).toBe(c.expect.timeAssumedNoon ?? false);
      // The instant and offset must always reproduce the local wall-clock time.
      const [y = 0, mo = 0, d = 0] = c.date.split('-').map(Number);
      const [h = 12, mi = 0] = c.time === null ? [] : c.time.split(':').map(Number);
      expect(Date.parse(result.instantUtc) + result.utcOffsetMinutes * 60_000).toBe(
        Date.UTC(y, mo - 1, d, h, mi),
      );
    }
    if (result.status === 'ambiguous') expect(result.offsets).toEqual(c.expect.offsets);
  });
});

describe('resolveBirthTime: future births', () => {
  const now = new Date('2026-10-17T12:00:00Z'); // 17:30 in India

  it.each([
    ['earlier today in India', '2026-10-17', '17:00', 'ok'],
    ['later today in India (after now)', '2026-10-17', '18:00', 'future'],
    ['tomorrow', '2026-10-18', '00:10', 'future'],
    ['unknown time today', '2026-10-17', null, 'ok'],
    ['unknown time tomorrow', '2026-10-18', null, 'future'],
  ] as const)('%s -> %s', (_label, date, time, status) => {
    expect(resolveBirthTime(toInput({ zone: 'Asia/Kolkata', date, time }), now).status).toBe(
      status,
    );
  });

  it('uses the birthplace calendar: already "tomorrow" in Kiritimati (UTC+14) is not future', () => {
    // 12:00 UTC on Oct 17 is 02:00 on Oct 18 in Kiritimati.
    expect(
      resolveBirthTime(
        toInput({ zone: 'Pacific/Kiritimati', date: '2026-10-18', time: '01:00' }),
        now,
      ).status,
    ).toBe('ok');
    expect(
      resolveBirthTime(toInput({ zone: 'Pacific/Kiritimati', date: '2026-10-18', time: null }), now)
        .status,
    ).toBe('ok');
  });
});

describe('resolveBirthTime: zones', () => {
  it.each(['Mars/Olympus', 'IST', '', 'Asia/Kolkata/Extra'])('rejects invalid zone %j', (zone) => {
    expect(resolveBirthTime(toInput({ zone, date: '1990-01-01', time: '12:00' }), NOW).status).toBe(
      'invalid_zone',
    );
    expect(isValidTimezone(zone)).toBe(false);
  });

  it('accepts UTC and multi-part zones', () => {
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('America/Argentina/Buenos_Aires')).toBe(true);
  });

  it('ignores offsetChoice when the time is not ambiguous', () => {
    const plain = resolveBirthTime(
      toInput({ zone: 'Asia/Kolkata', date: '1990-05-10', time: '19:55', offsetChoice: 'later' }),
      NOW,
    );
    expect(plain).toMatchObject({ status: 'ok', utcOffsetMinutes: 330 });
  });

  it('a gap stays a gap even with an offsetChoice', () => {
    const gap = resolveBirthTime(
      toInput({
        zone: 'America/New_York',
        date: '2021-03-14',
        time: '02:30',
        offsetChoice: 'earlier',
      }),
      NOW,
    );
    expect(gap.status).toBe('gap');
  });

  it('times just outside a gap resolve normally', () => {
    const before = resolveBirthTime(
      toInput({ zone: 'America/New_York', date: '2021-03-14', time: '01:59' }),
      NOW,
    );
    const after = resolveBirthTime(
      toInput({ zone: 'America/New_York', date: '2021-03-14', time: '03:00' }),
      NOW,
    );
    expect(before).toMatchObject({ status: 'ok', utcOffsetMinutes: -300 });
    expect(after).toMatchObject({ status: 'ok', utcOffsetMinutes: -240 });
  });
});
