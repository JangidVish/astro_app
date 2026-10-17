import type { ErrorCode, ValidationDetail } from '@astro/shared';

/**
 * An error the API returns to clients as `{ error: { code, message, retryable, details? } }`.
 * Throw this from services; anything else becomes a generic 500 INTERNAL.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly options: { retryable?: boolean; details?: ValidationDetail[]; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
  }

  get retryable(): boolean {
    return this.options.retryable ?? false;
  }

  static validation(details: ValidationDetail[]): AppError {
    return new AppError('VALIDATION_FAILED', 400, 'Request validation failed', { details });
  }

  static notFound(): AppError {
    return new AppError('NOT_FOUND', 404, 'Not found');
  }
}
