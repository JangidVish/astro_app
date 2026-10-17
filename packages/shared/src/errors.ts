import { z } from 'zod';

/**
 * Stable error codes returned by the API and used by the app to pick user-facing text.
 * Codes are part of the public contract: never rename one; add new codes instead.
 */
export const ERROR_CODES = [
  // Generic request problems
  'VALIDATION_FAILED',
  'UNKNOWN_FIELD',
  'INVALID_TYPE',
  'PAYLOAD_TOO_LARGE',
  'NOT_FOUND',
  'INTERNAL',
  /** A dependency (e.g. Firebase Auth) is temporarily unreachable; safe to retry. */
  'SERVICE_UNAVAILABLE',

  // Auth and account
  'UNAUTHENTICATED',
  'REAUTH_REQUIRED',
  'CONSENT_REQUIRED',

  // Birth data (data-model.md section 4)
  'INVALID_DATE',
  'DATE_OUT_OF_RANGE',
  'DATE_IN_FUTURE',
  'INVALID_TIME',
  'TIME_STATE_MISMATCH',
  'TIME_IN_DST_GAP',
  'TIME_AMBIGUOUS',
  'INVALID_NAME',
  'INVALID_RELATION',
  'EMPTY_UPDATE',

  // Places
  'PLACE_NOT_RESOLVED',
  'INVALID_COORDINATES',
  'INVALID_TIMEZONE',
  'QUERY_TOO_SHORT',
  'QUERY_TOO_LONG',

  // Business rules
  'PROFILE_LIMIT_REACHED',
  'BIRTH_TIME_REQUIRED',
  'PREDICTION_DATE_OUT_OF_RANGE',
  'QUOTA_EXCEEDED',

  // Astrology provider failures (never replaced with fabricated content; FR-21)
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const ERROR_CODE_SET: ReadonlySet<string> = new Set(ERROR_CODES);

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODE_SET.has(value);
}

export const errorCodeSchema = z.enum(ERROR_CODES);

/** One field-level problem. `path` uses dot notation, e.g. `birthTime.hour`. */
export const validationDetailSchema = z.strictObject({
  path: z.string(),
  code: errorCodeSchema,
});
export type ValidationDetail = z.infer<typeof validationDetailSchema>;

/** Shape of every non-2xx API response body. */
export const apiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: errorCodeSchema,
    message: z.string(),
    retryable: z.boolean(),
    details: z.array(validationDetailSchema).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/**
 * Converts a zod error into stable field-level codes.
 * Our schemas set each custom message to an ErrorCode; built-in zod issues map to generic codes.
 */
export function toValidationDetails(error: z.ZodError): ValidationDetail[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    if (isErrorCode(issue.message)) return { path, code: issue.message };
    if (issue.code === 'unrecognized_keys') return { path, code: 'UNKNOWN_FIELD' };
    if (issue.code === 'invalid_type') return { path, code: 'INVALID_TYPE' };
    return { path, code: 'VALIDATION_FAILED' };
  });
}
