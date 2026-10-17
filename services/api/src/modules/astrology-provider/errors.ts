import { AppError } from '../../common/errors.js';

/**
 * Why a provider call failed. Callers never see provider-specific codes, only these kinds.
 * - timeout / network / server: transient; retried by the HTTP client, then surfaced as 503.
 * - rate_limited: provider said slow down (429).
 * - auth: our credentials were rejected (401/403). Ops must act; users cannot.
 * - quota: out of credits (402 or provider-specific). Ops must act.
 * - bad_request: provider rejected our input (4xx). A bug or unsupported input on our side.
 * - malformed: response did not match the expected schema. Never cached.
 */
export type ProviderErrorKind =
  | 'timeout'
  | 'network'
  | 'server'
  | 'rate_limited'
  | 'auth'
  | 'quota'
  | 'bad_request'
  | 'malformed';

export const PROVIDER_ERROR_KINDS: readonly ProviderErrorKind[] = [
  'timeout',
  'network',
  'server',
  'rate_limited',
  'auth',
  'quota',
  'bad_request',
  'malformed',
];

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly endpoint: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(`provider ${kind} on ${endpoint}`, { cause: options.cause });
    this.name = 'ProviderError';
    this.status = options.status;
  }

  readonly status: number | undefined;

  /** True when operators must be alerted (credentials or credits), not just users told to retry. */
  get needsOps(): boolean {
    return this.kind === 'auth' || this.kind === 'quota';
  }
}

/**
 * Maps a provider failure to the API response (FR-21: a clear error, never fabricated content).
 * Users get a retryable 503 for anything transient or operational, 502 for data problems.
 */
export function providerErrorToAppError(error: ProviderError): AppError {
  switch (error.kind) {
    case 'rate_limited':
      return new AppError('PROVIDER_RATE_LIMITED', 503, 'Astrology service is busy, try again', {
        retryable: true,
        cause: error,
      });
    case 'timeout':
    case 'network':
    case 'server':
    case 'auth':
    case 'quota':
      return new AppError('PROVIDER_UNAVAILABLE', 503, 'Astrology service unavailable', {
        retryable: true,
        cause: error,
      });
    case 'bad_request':
    case 'malformed':
      return new AppError('PROVIDER_ERROR', 502, 'Astrology service returned an error', {
        retryable: false,
        cause: error,
      });
  }
}
