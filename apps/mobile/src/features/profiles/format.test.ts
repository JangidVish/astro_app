import {
  birthDateFromInput,
  birthTimeFromInput,
  dateInputValue,
  timeInputValue,
  todayInputValue,
} from './format';

describe('HTML date and time input values (web build)', () => {
  it('formats calendar fields with zero padding', () => {
    expect(dateInputValue({ year: 1990, month: 5, day: 7 })).toBe('1990-05-07');
    expect(timeInputValue({ hour: 6, minute: 5 })).toBe('06:05');
    expect(dateInputValue(null)).toBe('');
    expect(timeInputValue(null)).toBe('');
  });

  it('round-trips without going through Date (no time zone shift)', () => {
    for (const d of [
      { year: 1900, month: 1, day: 1 },
      { year: 1988, month: 11, day: 3 },
      { year: 2026, month: 12, day: 31 },
    ]) {
      expect(birthDateFromInput(dateInputValue(d))).toEqual(d);
    }
    for (const t of [
      { hour: 0, minute: 0 },
      { hour: 19, minute: 55 },
      { hour: 23, minute: 59 },
    ]) {
      expect(birthTimeFromInput(timeInputValue(t))).toEqual(t);
    }
  });

  it('accepts the seconds some browsers add to time values', () => {
    expect(birthTimeFromInput('06:41:00')).toEqual({ hour: 6, minute: 41 });
  });

  it.each(['', '1990-05', '1990-13-01', '1990-00-10', '1990-05-32', 'abcd-ef-gh', '1990--05'])(
    'rejects date %j',
    (value) => {
      expect(birthDateFromInput(value)).toBeNull();
    },
  );

  it.each(['', '24:00', '12:60', '7', 'aa:bb', '12:'])('rejects time %j', (value) => {
    expect(birthTimeFromInput(value)).toBeNull();
  });

  it("uses the device's calendar day for today", () => {
    expect(todayInputValue(new Date(2026, 9, 18, 23, 30))).toBe('2026-10-18');
  });
});
