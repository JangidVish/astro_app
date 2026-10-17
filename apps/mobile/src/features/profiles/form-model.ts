import {
  profileCreateInputSchema,
  resolveBirthTime,
  toValidationDetails,
  type BirthDate,
  type BirthTime,
  type OffsetChoice,
  type Place,
  type Profile,
  type ProfileCreateInput,
  type ProfileUpdateInput,
  type Relation,
  type ValidationDetail,
} from '@astro/shared';
import type { MessageKey } from '@/i18n/en';

export interface ProfileFormState {
  name: string;
  relation: Relation;
  birthDate: BirthDate | null;
  timeKnown: boolean;
  birthTime: BirthTime | null;
  place: Place | null;
  offsetChoice: OffsetChoice | null;
}

export type FieldName = 'name' | 'relation' | 'birthDate' | 'birthTime' | 'place' | 'offsetChoice';
export type FieldErrors = Partial<Record<FieldName, MessageKey>>;

export const emptyForm: ProfileFormState = {
  name: '',
  relation: 'self',
  birthDate: null,
  timeKnown: true,
  birthTime: null,
  place: null,
  offsetChoice: null,
};

export function formFromProfile(p: Profile): ProfileFormState {
  return {
    name: p.name,
    relation: p.relation,
    birthDate: p.birthDate,
    timeKnown: p.timeKnown,
    birthTime: p.birthTime,
    place: p.place,
    offsetChoice: p.offsetChoice,
  };
}

/**
 * What the birth date/time means at the chosen place, computed on the device with the same
 * resolver the server uses, so DST problems are explained before submitting.
 */
export type BirthCheck =
  | { kind: 'incomplete' }
  | { kind: 'ok'; utcOffsetMinutes: number }
  | { kind: 'gap' }
  | { kind: 'ambiguous'; offsets: readonly [number, number] }
  | { kind: 'future' };

export function checkBirth(form: ProfileFormState, now: Date = new Date()): BirthCheck {
  if (!form.birthDate || !form.place || (form.timeKnown && !form.birthTime))
    return { kind: 'incomplete' };
  const result = resolveBirthTime(
    {
      date: form.birthDate,
      time: form.timeKnown ? form.birthTime : null,
      timezoneId: form.place.timezoneId,
      offsetChoice: form.offsetChoice,
    },
    now,
  );
  switch (result.status) {
    case 'ok':
      return { kind: 'ok', utcOffsetMinutes: result.utcOffsetMinutes };
    case 'gap':
      return { kind: 'gap' };
    case 'ambiguous':
      return { kind: 'ambiguous', offsets: result.offsets };
    case 'future':
      return { kind: 'future' };
    case 'invalid_zone':
      return { kind: 'incomplete' };
  }
}

/** Server/schema error codes per field, as message keys. */
const CODE_MESSAGES: Partial<Record<string, MessageKey>> = {
  INVALID_NAME: 'profile.error.name',
  INVALID_DATE: 'profile.error.date',
  DATE_OUT_OF_RANGE: 'profile.error.dateRange',
  DATE_IN_FUTURE: 'profile.error.future',
  INVALID_TIME: 'profile.error.time',
  TIME_STATE_MISMATCH: 'profile.error.time',
  TIME_IN_DST_GAP: 'profile.error.gap',
  TIME_AMBIGUOUS: 'profile.error.ambiguous',
  PLACE_NOT_RESOLVED: 'profile.error.place',
};

const FIELD_BY_PATH: Record<string, FieldName> = {
  name: 'name',
  relation: 'relation',
  birthDate: 'birthDate',
  birthTime: 'birthTime',
  timeKnown: 'birthTime',
  placeId: 'place',
  offsetChoice: 'offsetChoice',
};

export function fieldErrorsFromDetails(details: readonly ValidationDetail[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const d of details) {
    const field = FIELD_BY_PATH[d.path.split('.')[0] ?? ''];
    const message = CODE_MESSAGES[d.code];
    if (field && message && !errors[field]) errors[field] = message;
  }
  return errors;
}

/** Validates the form; returns the API input or field errors (nothing is sent if invalid). */
export function toCreateInput(
  form: ProfileFormState,
  now: Date = new Date(),
): { input: ProfileCreateInput } | { errors: FieldErrors } {
  const errors: FieldErrors = {};
  if (!form.birthDate) errors.birthDate = 'profile.error.required';
  if (form.timeKnown && !form.birthTime) errors.birthTime = 'profile.error.required';
  if (!form.place) errors.place = 'profile.error.place';

  const check = checkBirth(form, now);
  if (check.kind === 'gap') errors.birthTime = 'profile.error.gap';
  if (check.kind === 'future') errors.birthDate = 'profile.error.future';
  if (check.kind === 'ambiguous') errors.offsetChoice = 'profile.error.ambiguous';

  const candidate = {
    name: form.name,
    relation: form.relation,
    birthDate: form.birthDate,
    timeKnown: form.timeKnown,
    birthTime: form.timeKnown ? form.birthTime : null,
    placeId: form.place?.placeId ?? '',
    offsetChoice: form.offsetChoice ?? null,
  };
  const parsed = profileCreateInputSchema.safeParse(candidate);
  if (!parsed.success)
    Object.assign(errors, {
      ...fieldErrorsFromDetails(toValidationDetails(parsed.error)),
      ...errors,
    });
  if (Object.keys(errors).length > 0 || !parsed.success) return { errors };
  return { input: parsed.data };
}

/** The changed fields only (time fields always travel together). */
export function toUpdateInput(input: ProfileCreateInput, original: Profile): ProfileUpdateInput {
  const update: ProfileUpdateInput = {};
  if (input.name !== original.name) update.name = input.name;
  if (input.relation !== original.relation) update.relation = input.relation;
  const d = input.birthDate;
  const o = original.birthDate;
  if (d.year !== o.year || d.month !== o.month || d.day !== o.day) update.birthDate = d;
  const timeChanged =
    input.timeKnown !== original.timeKnown ||
    input.birthTime?.hour !== original.birthTime?.hour ||
    input.birthTime?.minute !== original.birthTime?.minute;
  if (timeChanged) {
    update.timeKnown = input.timeKnown;
    update.birthTime = input.birthTime;
  }
  if (input.placeId !== original.place.placeId) update.placeId = input.placeId;
  if ((input.offsetChoice ?? null) !== original.offsetChoice)
    update.offsetChoice = input.offsetChoice ?? null;
  return update;
}
