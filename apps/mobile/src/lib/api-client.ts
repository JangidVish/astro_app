import { z } from 'zod';
import {
  antardashaResponseSchema,
  apiErrorSchema,
  chartResponseSchema,
  mahadashaResponseSchema,
  meResponseSchema,
  placeSearchResponseSchema,
  planetsResponseSchema,
  predictionResponseSchema,
  profileListResponseSchema,
  profileSchema,
  type ChartType,
  type ErrorCode,
  type Graha,
  type MeUpdateInput,
  type ProfileCreateInput,
  type ProfileUpdateInput,
  type ValidationDetail,
} from '@astro/shared';

/** Client-side failures that never come from the API body. */
export type ClientErrorCode = 'NETWORK' | 'TIMEOUT' | 'INVALID_RESPONSE';

/** Every failure the app can see, with a stable code the UI turns into text. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | ClientErrorCode,
    readonly status: number,
    message: string,
    readonly retryable: boolean,
    readonly details: readonly ValidationDetail[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Firebase ID token for the signed-in user, or null when signed out. */
  getIdToken: () => Promise<string | null>;
  /** App Check token (required by staging/prod API), or null when unavailable. */
  getAppCheckToken?: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(
    method: Method,
    path: string,
    schema: z.ZodType<T> | null,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    const [idToken, appCheck] = await Promise.all([
      options.getIdToken(),
      options.getAppCheckToken?.() ?? Promise.resolve(null),
    ]);
    if (idToken) headers['authorization'] = `Bearer ${idToken}`;
    if (appCheck) headers['x-firebase-appcheck'] = appCheck;
    if (body !== undefined) headers['content-type'] = 'application/json';

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(`${options.baseUrl}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
    } catch {
      throw controller.signal.aborted
        ? new ApiError('TIMEOUT', 0, 'The request took too long', true)
        : new ApiError('NETWORK', 0, 'No connection to the server', true);
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 204) return undefined as T;

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new ApiError(
        'INVALID_RESPONSE',
        response.status,
        'Unexpected response from server',
        true,
      );
    }

    if (!response.ok) {
      const parsed = apiErrorSchema.safeParse(json);
      if (!parsed.success) {
        throw new ApiError(
          'INVALID_RESPONSE',
          response.status,
          'Unexpected response from server',
          true,
        );
      }
      const e = parsed.data.error;
      throw new ApiError(e.code, response.status, e.message, e.retryable, e.details ?? []);
    }
    if (!schema) return json as T;
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      // The server answered in a shape this app version does not understand.
      throw new ApiError(
        'INVALID_RESPONSE',
        response.status,
        'Unexpected response from server',
        false,
      );
    }
    return parsed.data;
  }

  const enc = encodeURIComponent;
  const healthSchema = z.object({ status: z.literal('ok') });

  return {
    health: () => request('GET', '/healthz', healthSchema),

    getMe: () => request('GET', '/v1/me', meResponseSchema),
    updateMe: (input: MeUpdateInput) => request('PATCH', '/v1/me', meResponseSchema, input),
    deleteMe: () => request<void>('DELETE', '/v1/me', null),

    searchPlaces: (q: string) =>
      request('GET', `/v1/places?q=${enc(q)}`, placeSearchResponseSchema),

    listProfiles: () => request('GET', '/v1/profiles', profileListResponseSchema),
    createProfile: (input: ProfileCreateInput) =>
      request('POST', '/v1/profiles', profileSchema, input),
    getProfile: (id: string) => request('GET', `/v1/profiles/${enc(id)}`, profileSchema),
    updateProfile: (id: string, input: ProfileUpdateInput) =>
      request('PATCH', `/v1/profiles/${enc(id)}`, profileSchema, input),
    deleteProfile: (id: string) => request<void>('DELETE', `/v1/profiles/${enc(id)}`, null),

    getChart: (id: string, type: ChartType) =>
      request('GET', `/v1/profiles/${enc(id)}/chart?type=${type}`, chartResponseSchema),
    getPlanets: (id: string) =>
      request('GET', `/v1/profiles/${enc(id)}/planets`, planetsResponseSchema),
    getDasha: (id: string) =>
      request('GET', `/v1/profiles/${enc(id)}/dasha`, mahadashaResponseSchema),
    getAntardashas: (id: string, md: Graha) =>
      request('GET', `/v1/profiles/${enc(id)}/dasha/${md}`, antardashaResponseSchema),
    getPrediction: (id: string, date: string) =>
      request(
        'GET',
        `/v1/profiles/${enc(id)}/prediction?date=${enc(date)}`,
        predictionResponseSchema,
      ),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
