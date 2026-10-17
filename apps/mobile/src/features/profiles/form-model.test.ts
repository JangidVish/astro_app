import type { Place, Profile } from '@astro/shared';
import { formatUtcOffset, pickerDateFromWall, wallFromPickerDate } from './format';
import {
  checkBirth,
  emptyForm,
  fieldErrorsFromDetails,
  toCreateInput,
  toUpdateInput,
  type ProfileFormState,
} from './form-model';

const NOW = new Date('2026-10-17T12:00:00Z');
const mumbai: Place = {
  placeId: 'pl_aaaaaaaaaaaaaaaaaaaaaaaa',
  name: 'Mumbai',
  countryCode: 'IN',
  lat: 19.07,
  lon: 72.88,
  timezoneId: 'Asia/Kolkata',
};
const newYork: Place = {
  placeId: 'pl_bbbbbbbbbbbbbbbbbbbbbbbb',
  name: 'New York',
  countryCode: 'US',
  lat: 40.71,
  lon: -74.0,
  timezoneId: 'America/New_York',
};

const valid: ProfileFormState = {
  ...emptyForm,
  name: 'Asha Rao',
  birthDate: { year: 1990, month: 5, day: 10 },
  birthTime: { hour: 19, minute: 55 },
  place: mumbai,
};

describe('checkBirth (same resolver as the server)', () => {
  it('is incomplete until date, time and place are set', () => {
    expect(checkBirth(emptyForm, NOW)).toEqual({ kind: 'incomplete' });
    expect(checkBirth({ ...valid, place: null }, NOW)).toEqual({ kind: 'incomplete' });
  });

  it('resolves the offset at the birth place', () => {
    expect(checkBirth(valid, NOW)).toEqual({ kind: 'ok', utcOffsetMinutes: 330 });
  });

  it('flags a DST gap (New York, 2021-03-14 02:30)', () => {
    const form = {
      ...valid,
      place: newYork,
      birthDate: { year: 2021, month: 3, day: 14 },
      birthTime: { hour: 2, minute: 30 },
    };
    expect(checkBirth(form, NOW)).toEqual({ kind: 'gap' });
  });

  it('flags a DST overlap with both offsets, and resolves once a choice is made', () => {
    const form = {
      ...valid,
      place: newYork,
      birthDate: { year: 2021, month: 11, day: 7 },
      birthTime: { hour: 1, minute: 30 },
    };
    expect(checkBirth(form, NOW)).toEqual({ kind: 'ambiguous', offsets: [-240, -300] });
    expect(checkBirth({ ...form, offsetChoice: 'later' }, NOW)).toEqual({
      kind: 'ok',
      utcOffsetMinutes: -300,
    });
  });

  it('flags a future birth', () => {
    expect(checkBirth({ ...valid, birthDate: { year: 2027, month: 1, day: 1 } }, NOW)).toEqual({
      kind: 'future',
    });
  });

  it('unknown time uses noon and needs no time value', () => {
    expect(checkBirth({ ...valid, timeKnown: false, birthTime: null }, NOW)).toEqual({
      kind: 'ok',
      utcOffsetMinutes: 330,
    });
  });
});

describe('toCreateInput', () => {
  it('builds the API input; unknown time sends null', () => {
    expect(toCreateInput(valid, NOW)).toEqual({
      input: {
        name: 'Asha Rao',
        relation: 'self',
        birthDate: { year: 1990, month: 5, day: 10 },
        timeKnown: true,
        birthTime: { hour: 19, minute: 55 },
        placeId: mumbai.placeId,
        offsetChoice: null,
      },
    });
    const unknown = toCreateInput(
      { ...valid, timeKnown: false, birthTime: { hour: 3, minute: 0 } },
      NOW,
    );
    expect('input' in unknown && unknown.input.birthTime).toBeNull();
  });

  it('reports every missing field and sends nothing', () => {
    expect(toCreateInput({ ...emptyForm }, NOW)).toEqual({
      errors: expect.objectContaining({
        birthDate: 'profile.error.required',
        birthTime: 'profile.error.required',
        place: 'profile.error.place',
        name: 'profile.error.name',
      }),
    });
  });

  it('blocks a gap and an unanswered overlap', () => {
    const gap = {
      ...valid,
      place: newYork,
      birthDate: { year: 2021, month: 3, day: 14 },
      birthTime: { hour: 2, minute: 30 },
    };
    expect(toCreateInput(gap, NOW)).toEqual({ errors: { birthTime: 'profile.error.gap' } });
    const overlap = {
      ...gap,
      birthDate: { year: 2021, month: 11, day: 7 },
      birthTime: { hour: 1, minute: 30 },
    };
    expect(toCreateInput(overlap, NOW)).toEqual({
      errors: { offsetChoice: 'profile.error.ambiguous' },
    });
    expect(toCreateInput({ ...overlap, offsetChoice: 'earlier' }, NOW)).toMatchObject({
      input: { offsetChoice: 'earlier' },
    });
  });

  it('rejects an invalid name', () => {
    expect(toCreateInput({ ...valid, name: 'Agent 007' }, NOW)).toEqual({
      errors: { name: 'profile.error.name' },
    });
  });
});

describe('fieldErrorsFromDetails', () => {
  it('maps server field codes onto form fields', () => {
    expect(
      fieldErrorsFromDetails([
        { path: 'birthTime', code: 'TIME_IN_DST_GAP' },
        { path: 'placeId', code: 'PLACE_NOT_RESOLVED' },
        { path: 'birthDate.year', code: 'DATE_OUT_OF_RANGE' },
        { path: 'mystery', code: 'VALIDATION_FAILED' },
      ]),
    ).toEqual({
      birthTime: 'profile.error.gap',
      place: 'profile.error.place',
      birthDate: 'profile.error.dateRange',
    });
  });
});

describe('toUpdateInput', () => {
  const original: Profile = {
    id: 'abcdefghijklmnopqrst',
    name: 'Asha Rao',
    relation: 'self',
    birthDate: { year: 1990, month: 5, day: 10 },
    timeKnown: true,
    birthTime: { hour: 19, minute: 55 },
    place: mumbai,
    utcOffsetMinutes: 330,
    offsetChoice: null,
    timeAssumedNoon: false,
    isPrimary: true,
    createdAt: '2026-10-17T12:00:00Z',
    updatedAt: '2026-10-17T12:00:00Z',
  };
  const input = (toCreateInput(valid, NOW) as { input: Parameters<typeof toUpdateInput>[0] }).input;

  it('sends nothing when nothing changed', () => {
    expect(toUpdateInput(input, original)).toEqual({});
  });
  it('sends only the name when only the name changed', () => {
    expect(toUpdateInput({ ...input, name: 'Asha R' }, original)).toEqual({ name: 'Asha R' });
  });
  it('sends time fields together', () => {
    expect(toUpdateInput({ ...input, timeKnown: false, birthTime: null }, original)).toEqual({
      timeKnown: false,
      birthTime: null,
    });
  });
  it('sends a new place id', () => {
    expect(toUpdateInput({ ...input, placeId: newYork.placeId }, original)).toEqual({
      placeId: newYork.placeId,
    });
  });
});

describe('format', () => {
  it.each([
    [330, 'UTC+05:30'],
    [345, 'UTC+05:45'],
    [0, 'UTC+00:00'],
    [-210, 'UTC−03:30'],
    [840, 'UTC+14:00'],
  ])('formatUtcOffset(%i) = %s', (minutes, text) => {
    expect(formatUtcOffset(minutes)).toBe(text);
  });

  it('picker dates round-trip wall-clock values regardless of the device time zone', () => {
    const date = { year: 2021, month: 3, day: 14 };
    const time = { hour: 2, minute: 30 };
    expect(wallFromPickerDate(pickerDateFromWall(date, time))).toEqual({ date, time });
  });
});
