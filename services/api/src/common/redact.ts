/**
 * Removes personal data and credentials from anything about to be logged (NFR-4).
 *
 * Matching is by key name, case-insensitive, at any depth. The list is deliberately broad:
 * provider request bodies use short names such as `day`, `min`, `lat`, so those are included.
 * Over-redacting a log line is acceptable; leaking birth data is not.
 */
export const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set(
  [
    // credentials
    'authorization',
    'cookie',
    'set-cookie',
    'x-firebase-appcheck',
    'x-astrologyapi-key',
    'token',
    'idtoken',
    'accesstoken',
    'refreshtoken',
    'password',
    'apikey',
    'api_key',
    'userid',
    'pepper',
    'secret',
    // identity
    'email',
    'name',
    'displayname',
    // birth data (our model)
    'birthdate',
    'birthtime',
    'place',
    'placeid',
    'q',
    // birth data (provider request fields)
    'day',
    'month',
    'year',
    'hour',
    'min',
    'minute',
    'lat',
    'lon',
    'latitude',
    'longitude',
    'tzone',
  ].map((k) => k.toLowerCase()),
);

const MAX_DEPTH = 8;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

/** Returns a redacted deep copy. Handles cycles, Errors, arrays and depth limits. */
export function redact(value: unknown): unknown {
  return walk(value, 0, new WeakSet());
}

function walk(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Truncated]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => walk(item, depth + 1, seen));

  if (value instanceof Error) {
    // Keep type and message; messages are written by us and never contain request data.
    // Error properties (e.g. `cause`, custom fields) are walked like any object.
    const out: Record<string, unknown> = { type: value.name, message: value.message };
    for (const [key, inner] of Object.entries(value)) {
      out[key] = isSensitiveKey(key) ? REDACTED : walk(inner, depth + 1, seen);
    }
    if (value.cause !== undefined) out['cause'] = walk(value.cause, depth + 1, seen);
    return out;
  }

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? REDACTED : walk(inner, depth + 1, seen);
  }
  return out;
}

/** Drops the query string: it can carry place searches and dates. Path segments are opaque ids. */
export function redactUrl(url: string): string {
  const index = url.indexOf('?');
  return index === -1 ? url : `${url.slice(0, index)}?${REDACTED}`;
}
