import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-client';

/** Retry only failures the server says are worth retrying (network, 5xx, provider busy). */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  return error instanceof ApiError ? error.retryable && error.code !== 'QUOTA_EXCEEDED' : false;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        // Charts and dasha never change for a profile; the server caches them. Keep them a while.
        staleTime: 5 * 60_000,
      },
      mutations: { retry: false },
    },
  });
}
