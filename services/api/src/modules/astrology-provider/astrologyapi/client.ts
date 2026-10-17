import { ProviderError, type ProviderErrorKind } from '../errors.js';

export const ASTROLOGYAPI_BASE_URL = 'https://json.astrologyapi.com/v1/';

/** Provider guidance: 10 s timeout; retry 5xx/network with 1 s, 2 s, 4 s backoff (4 attempts). */
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [1_000, 2_000, 4_000];

/** Responses above this are treated as malformed; real responses are a few KB. */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** Endpoint paths are fixed strings from our code: lowercase segments, no dots, slashes or queries. */
const ENDPOINT_PATTERN = /^[a-z_]+(?:\/[A-Za-z0-9_]+)*$/;

const RETRYABLE: ReadonlySet<ProviderErrorKind> = new Set(['timeout', 'network', 'server']);

/** Metadata about one HTTP attempt. Never contains request bodies, responses or credentials. */
export interface ProviderCallRecord {
  readonly endpoint: string;
  readonly attempt: number;
  readonly latencyMs: number;
  readonly status: number | null;
  readonly errorKind: ProviderErrorKind | null;
}

export interface AstrologyApiClientOptions {
  readonly userId: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly language?: string;
  readonly timeoutMs?: number;
  readonly retryDelaysMs?: readonly number[];
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
  readonly onCall?: (record: ProviderCallRecord) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class AstrologyApiClient {
  private readonly authorization: string;
  private readonly baseUrl: string;
  private readonly language: string;
  private readonly timeoutMs: number;
  private readonly retryDelaysMs: readonly number[];
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly onCall: ((record: ProviderCallRecord) => void) | undefined;

  constructor(options: AstrologyApiClientOptions) {
    if (!options.userId || !options.apiKey) {
      throw new Error('AstrologyAPI credentials are required');
    }
    this.authorization = `Basic ${Buffer.from(`${options.userId}:${options.apiKey}`).toString('base64')}`;
    this.baseUrl = options.baseUrl ?? ASTROLOGYAPI_BASE_URL;
    this.language = options.language ?? 'en';
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => performance.now());
    this.onCall = options.onCall;
  }

  /**
   * POSTs a JSON body and returns the parsed JSON response.
   * Throws ProviderError; retries only transient failures.
   */
  async post(endpoint: string, body: Readonly<Record<string, unknown>>): Promise<unknown> {
    if (!ENDPOINT_PATTERN.test(endpoint)) {
      // Programming error, not a provider failure: endpoints are constants in our code.
      throw new Error(`Invalid provider endpoint: ${JSON.stringify(endpoint)}`);
    }
    const url = new URL(endpoint, this.baseUrl).toString();
    const payload = JSON.stringify(body);

    for (let attempt = 1; ; attempt++) {
      const started = this.now();
      try {
        const { status, value } = await this.attempt(url, endpoint, payload);
        this.record({ endpoint, attempt, started, status, errorKind: null });
        return value;
      } catch (error) {
        const providerError =
          error instanceof ProviderError
            ? error
            : new ProviderError('network', endpoint, { cause: error });
        this.record({
          endpoint,
          attempt,
          started,
          status: providerError.status ?? null,
          errorKind: providerError.kind,
        });
        const delay = this.retryDelaysMs[attempt - 1];
        if (!RETRYABLE.has(providerError.kind) || delay === undefined) throw providerError;
        await this.sleep(delay);
      }
    }
  }

  private async attempt(
    url: string,
    endpoint: string,
    payload: string,
  ): Promise<{ status: number; value: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            authorization: this.authorization,
            'content-type': 'application/json',
            accept: 'application/json',
            'accept-language': this.language,
          },
          body: payload,
          signal: controller.signal,
          redirect: 'error', // never follow redirects with our credentials attached
        });
      } catch (error) {
        throw new ProviderError(controller.signal.aborted ? 'timeout' : 'network', endpoint, {
          cause: error,
        });
      }

      const statusKind = classifyStatus(response.status);
      if (statusKind) {
        await response.body?.cancel().catch(() => undefined);
        throw new ProviderError(statusKind, endpoint, { status: response.status });
      }

      let text: string;
      try {
        text = await readCapped(response, MAX_RESPONSE_BYTES);
      } catch (error) {
        if (error instanceof ResponseTooLargeError) {
          throw new ProviderError('malformed', endpoint, { status: response.status, cause: error });
        }
        throw new ProviderError(controller.signal.aborted ? 'timeout' : 'network', endpoint, {
          status: response.status,
          cause: error,
        });
      }

      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch (error) {
        throw new ProviderError('malformed', endpoint, { status: response.status, cause: error });
      }
      // Some endpoints report failures as HTTP 200 with `"status": false`.
      if (isErrorPayload(value)) {
        throw new ProviderError('bad_request', endpoint, { status: response.status });
      }
      return { status: response.status, value };
    } finally {
      clearTimeout(timer);
    }
  }

  private record(entry: {
    endpoint: string;
    attempt: number;
    started: number;
    status: number | null;
    errorKind: ProviderErrorKind | null;
  }): void {
    if (!this.onCall) return;
    try {
      this.onCall({
        endpoint: entry.endpoint,
        attempt: entry.attempt,
        latencyMs: Math.max(0, Math.round(this.now() - entry.started)),
        status: entry.status,
        errorKind: entry.errorKind,
      });
    } catch {
      // Call bookkeeping must never break a user request.
    }
  }
}

/** Maps an HTTP status to a failure kind, or null for success (2xx). */
export function classifyStatus(status: number): ProviderErrorKind | null {
  if (status >= 200 && status < 300) return null;
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'quota';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  return 'bad_request';
}

function isErrorPayload(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { status?: unknown }).status === false
  );
}

class ResponseTooLargeError extends Error {
  constructor() {
    super('response exceeded size limit');
    this.name = 'ResponseTooLargeError';
  }
}

/** Reads the body as UTF-8, aborting as soon as it exceeds `limit` bytes. */
async function readCapped(response: Response, limit: number): Promise<string> {
  if (!response.body) return '';
  // Fetch bodies are byte streams; Node's DOM typings leave the chunk type as `any`.
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new ResponseTooLargeError();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
