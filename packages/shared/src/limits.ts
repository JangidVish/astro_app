/** Request bodies above this size are rejected with PAYLOAD_TOO_LARGE. */
export const MAX_BODY_BYTES = 16 * 1024;

/** Birth profiles per account (FR-4). */
export const MAX_PROFILES_PER_USER = 5;

/** Earliest supported birth date (data-model.md section 4.1). */
export const MIN_BIRTH_YEAR = 1900;

export const PROFILE_NAME_MAX = 60;
export const DISPLAY_NAME_MAX = 50;

export const PLACE_QUERY_MIN = 3;
export const PLACE_QUERY_MAX = 100;

/**
 * Max distance between a requested prediction date and the server's UTC date.
 * The app requests the user's local today ±1 (FR-16), and local "today" is itself within ±1 day
 * of the UTC date (zones span UTC-12..UTC+14), so the API must accept UTC date ±2.
 */
export const PREDICTION_DATE_WINDOW_DAYS = 2;
