import { describe, expect, it } from 'vitest';
import { ProviderError } from '../errors.js';
import {
  AstrologyApiClient,
  classifyStatus,
  MAX_RESPONSE_BYTES,
  type AstrologyApiClientOptions,
  type ProviderCallRecord,
} from './client.js';

const USER_ID = 'test-user-id-1234';
const API_KEY = 'test-api-key-abcdefgh';

type Step =
  | { status: number; body?: string; headers?: Record<string, string> }
  | { stream: Uint8Array[]; status?: number }
  | { networkError: Error }
  | { hang: true }
  | { hangMidBody: true }
  | { failMidBody: true };

interface Harness {
  client: AstrologyApiClient;
  requests: { url: string; init: RequestInit }[];
  sleeps: number[];
  records: ProviderCallRecord[];
}

/** Fake fetch: plays one scripted step per attempt. */
function harness(steps: Step[], options: Partial<AstrologyApiClientOptions> = {}): Harness {
  const requests: Harness['requests'] = [];
  const sleeps: number[] = [];
  const records: ProviderCallRecord[] = [];
  let index = 0;

  const fetch = ((input: string | URL | Request, init: RequestInit = {}) => {
    const url = input instanceof Request ? input.url : String(input);
    requests.push({ url, init });
    const step = steps[index++];
    if (!step) throw new Error(`unexpected request #${String(index)}`);

    if ('networkError' in step) return Promise.reject(step.networkError);
    if ('hang' in step) {
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    }
    if ('hangMidBody' in step) {
      // Headers arrive, then the body stalls until our timeout aborts the request.
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('[{"partial":'));
          init.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('aborted', 'AbortError'));
          });
        },
      });
      return Promise.resolve(new Response(stream, { status: 200 }));
    }
    if ('failMidBody' in step) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('[{"partial":'));
          controller.error(new Error('ECONNRESET'));
        },
      });
      return Promise.resolve(new Response(stream, { status: 200 }));
    }
    if ('stream' in step) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of step.stream) controller.enqueue(chunk);
          controller.close();
        },
      });
      return Promise.resolve(new Response(stream, { status: step.status ?? 200 }));
    }
    return Promise.resolve(
      new Response(step.body ?? null, { status: step.status, headers: step.headers }),
    );
  }) as typeof globalThis.fetch;

  const client = new AstrologyApiClient({
    userId: USER_ID,
    apiKey: API_KEY,
    fetch,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    timeoutMs: 50,
    onCall: (record) => records.push(record),
    ...options,
  });
  return { client, requests, sleeps, records };
}

async function failure(promise: Promise<unknown>): Promise<ProviderError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ProviderError) return error;
    throw error;
  }
  throw new Error('expected a ProviderError');
}

const BODY = { day: 10, month: 5, year: 1990, hour: 19, min: 55, lat: 19.2, lon: 72.8, tzone: 5.5 };

describe('AstrologyApiClient: request', () => {
  it('POSTs JSON to the endpoint with Basic auth and returns parsed JSON', async () => {
    const h = harness([{ status: 200, body: '[{"name":"Sun"}]' }]);
    await expect(h.client.post('planets', BODY)).resolves.toEqual([{ name: 'Sun' }]);

    const [request] = h.requests;
    expect(request?.url).toBe('https://json.astrologyapi.com/v1/planets');
    expect(request?.init.method).toBe('POST');
    expect(request?.init.body).toBe(JSON.stringify(BODY));
    expect(request?.init.redirect).toBe('error');
    const headers = request?.init.headers as Record<string, string>;
    expect(headers['authorization']).toBe(
      `Basic ${Buffer.from(`${USER_ID}:${API_KEY}`).toString('base64')}`,
    );
    expect(headers['content-type']).toBe('application/json');
    expect(headers['accept-language']).toBe('en');
  });

  it('keeps credentials out of the URL', async () => {
    const h = harness([{ status: 200, body: '{}' }]);
    await h.client.post('birth_details', BODY);
    expect(h.requests[0]?.url).not.toContain(USER_ID);
    expect(h.requests[0]?.url).not.toContain(API_KEY);
  });

  it('supports nested endpoint paths', async () => {
    const h = harness([{ status: 200, body: '[]' }]);
    await h.client.post('horo_chart/D9', BODY);
    expect(h.requests[0]?.url).toBe('https://json.astrologyapi.com/v1/horo_chart/D9');
  });

  it.each([
    '../admin',
    'https://evil.example/steal',
    '//evil.example/x',
    'planets?x=1',
    'planets#frag',
    'Planets',
    '',
    'horo_chart/../x',
    'horo_chart/D1/',
  ])('refuses endpoint %j without sending anything', async (endpoint) => {
    const h = harness([]);
    await expect(h.client.post(endpoint, BODY)).rejects.toThrow(/Invalid provider endpoint/);
    expect(h.requests).toHaveLength(0);
  });

  it('requires credentials', () => {
    expect(() => new AstrologyApiClient({ userId: '', apiKey: 'k' })).toThrow(/credentials/);
    expect(() => new AstrologyApiClient({ userId: 'u', apiKey: '' })).toThrow(/credentials/);
  });
});

describe('AstrologyApiClient: status classification', () => {
  it.each([
    [200, null],
    [204, null],
    [400, 'bad_request'],
    [401, 'auth'],
    [403, 'auth'],
    [402, 'quota'],
    [404, 'bad_request'],
    [422, 'bad_request'],
    [429, 'rate_limited'],
    [500, 'server'],
    [502, 'server'],
    [503, 'server'],
    [301, 'bad_request'],
  ])('HTTP %i -> %s', (status, kind) => {
    expect(classifyStatus(status)).toBe(kind);
  });
});

describe('AstrologyApiClient: no retry on client errors', () => {
  it.each([
    [401, 'auth'],
    [402, 'quota'],
    [429, 'rate_limited'],
    [400, 'bad_request'],
  ] as const)('HTTP %i fails immediately as %s', async (status, kind) => {
    const h = harness([{ status, body: '{"code":"x","message":"y"}' }]);
    const error = await failure(h.client.post('planets', BODY));
    expect([error.kind, error.status]).toEqual([kind, status]);
    expect(h.requests).toHaveLength(1);
    expect(h.sleeps).toEqual([]);
  });
});

describe('AstrologyApiClient: retries transient failures', () => {
  it('retries 5xx with 1s, 2s, 4s backoff, then succeeds', async () => {
    const h = harness([
      { status: 503 },
      { status: 500 },
      { status: 502 },
      { status: 200, body: '{"ok":true}' },
    ]);
    await expect(h.client.post('planets', BODY)).resolves.toEqual({ ok: true });
    expect(h.sleeps).toEqual([1000, 2000, 4000]);
    expect(h.requests).toHaveLength(4);
  });

  it('gives up after 4 attempts with the last failure kind', async () => {
    const h = harness([{ status: 500 }, { status: 500 }, { status: 500 }, { status: 503 }]);
    const error = await failure(h.client.post('planets', BODY));
    expect([error.kind, error.status]).toEqual(['server', 503]);
    expect(h.requests).toHaveLength(4);
    expect(h.sleeps).toEqual([1000, 2000, 4000]);
  });

  it('retries network errors (DNS, connection reset)', async () => {
    const h = harness([
      { networkError: new TypeError('fetch failed: getaddrinfo ENOTFOUND') },
      { networkError: new TypeError('fetch failed: ECONNRESET') },
      { status: 200, body: '[]' },
    ]);
    await expect(h.client.post('planets', BODY)).resolves.toEqual([]);
    expect(h.sleeps).toEqual([1000, 2000]);
  });

  it('times out a hanging request and retries it', async () => {
    const h = harness([{ hang: true }, { status: 200, body: '[]' }]);
    await expect(h.client.post('planets', BODY)).resolves.toEqual([]);
    expect(h.records.map((r) => r.errorKind)).toEqual(['timeout', null]);
  });

  it('reports timeout when every attempt hangs', async () => {
    const h = harness([{ hang: true }, { hang: true }, { hang: true }, { hang: true }]);
    expect((await failure(h.client.post('planets', BODY))).kind).toBe('timeout');
    expect(h.requests).toHaveLength(4);
  });

  it('treats a connection dropped mid-body as a network failure and retries', async () => {
    const h = harness([{ failMidBody: true }, { status: 200, body: '{"a":1}' }]);
    await expect(h.client.post('planets', BODY)).resolves.toEqual({ a: 1 });
    expect(h.records[0]?.errorKind).toBe('network');
  });

  it('honours custom retry delays (none = single attempt)', async () => {
    const h = harness([{ status: 500 }], { retryDelaysMs: [] });
    expect((await failure(h.client.post('planets', BODY))).kind).toBe('server');
    expect(h.requests).toHaveLength(1);
  });
});

describe('AstrologyApiClient: bad response bodies', () => {
  it.each([
    ['non-JSON', '<html>gateway</html>'],
    ['truncated JSON', '[{"name":"Sun"'],
    ['empty body', ''],
  ])('%s on HTTP 200 is malformed and not retried', async (_label, body) => {
    const h = harness([{ status: 200, body }]);
    expect((await failure(h.client.post('planets', BODY))).kind).toBe('malformed');
    expect(h.requests).toHaveLength(1);
  });

  it('HTTP 200 with "status": false is a provider-reported error', async () => {
    const h = harness([{ status: 200, body: '{"status":false,"msg":"invalid date"}' }]);
    const error = await failure(h.client.post('planets', BODY));
    expect([error.kind, error.status]).toEqual(['bad_request', 200]);
  });

  it('accepts "status": true payloads', async () => {
    const h = harness([{ status: 200, body: '{"status":true,"prediction":["x"]}' }]);
    await expect(h.client.post('planets', BODY)).resolves.toMatchObject({ status: true });
  });

  it('rejects bodies over 2 MB while streaming', async () => {
    const chunk = new Uint8Array(512 * 1024).fill(32);
    const h = harness([{ stream: [chunk, chunk, chunk, chunk, chunk] }]);
    const error = await failure(h.client.post('planets', BODY));
    expect(error.kind).toBe('malformed');
    expect(5 * chunk.byteLength).toBeGreaterThan(MAX_RESPONSE_BYTES);
  });

  it('reassembles multi-byte UTF-8 split across chunks', async () => {
    const bytes = new TextEncoder().encode('{"name":"शनि"}');
    const h = harness([{ stream: [bytes.slice(0, 11), bytes.slice(11)] }]);
    await expect(h.client.post('planets', BODY)).resolves.toEqual({ name: 'शनि' });
  });
});

describe('AstrologyApiClient: more edge cases', () => {
  it('times out a body that stalls after the headers arrive, and retries', async () => {
    const h = harness([{ hangMidBody: true }, { status: 200, body: '[]' }]);
    await expect(h.client.post('planets', BODY)).resolves.toEqual([]);
    expect(h.records[0]?.errorKind).toBe('timeout');
  });

  it('treats a 200 with no body at all as malformed', async () => {
    const h = harness([{ status: 200 }]);
    expect((await failure(h.client.post('planets', BODY))).kind).toBe('malformed');
  });

  it('works without an onCall hook', async () => {
    const h = harness([{ status: 200, body: '[]' }], { onCall: undefined });
    await expect(h.client.post('planets', BODY)).resolves.toEqual([]);
  });

  it('uses global fetch, real sleep and default timeout when not injected', async () => {
    const calls: string[] = [];
    let attempt = 0;
    const original = globalThis.fetch;
    globalThis.fetch = (input: string | URL | Request) => {
      calls.push(input instanceof Request ? input.url : input.toString());
      attempt += 1;
      return Promise.resolve(
        attempt === 1 ? new Response(null, { status: 503 }) : new Response('[1]', { status: 200 }),
      );
    };
    try {
      const client = new AstrologyApiClient({
        userId: USER_ID,
        apiKey: API_KEY,
        retryDelaysMs: [1],
      });
      await expect(client.post('planets', BODY)).resolves.toEqual([1]);
      expect(calls).toEqual([
        'https://json.astrologyapi.com/v1/planets',
        'https://json.astrologyapi.com/v1/planets',
      ]);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('AstrologyApiClient: call records and secrecy', () => {
  it('records each attempt with status, kind, latency and attempt number', async () => {
    let clock = 0;
    const h = harness([{ status: 500 }, { status: 200, body: '[]' }], {
      now: () => (clock += 25),
    });
    await h.client.post('planets', BODY);
    expect(h.records).toEqual([
      { endpoint: 'planets', attempt: 1, latencyMs: 25, status: 500, errorKind: 'server' },
      { endpoint: 'planets', attempt: 2, latencyMs: 25, status: 200, errorKind: null },
    ]);
  });

  it('a throwing onCall hook never breaks the request', async () => {
    const h = harness([{ status: 200, body: '[]' }], {
      onCall: () => {
        throw new Error('firestore down');
      },
    });
    await expect(h.client.post('planets', BODY)).resolves.toEqual([]);
  });

  it('never exposes credentials or birth data in errors or records', async () => {
    const h = harness([{ status: 401, body: `{"message":"bad key ${API_KEY}"}` }]);
    const error = await failure(h.client.post('planets', BODY));
    const surface = JSON.stringify({
      message: error.message,
      kind: error.kind,
      endpoint: error.endpoint,
      status: error.status,
      cause: String(error.cause),
      records: h.records,
    });
    expect(surface).not.toContain(API_KEY);
    expect(surface).not.toContain(USER_ID);
    expect(surface).not.toContain(Buffer.from(`${USER_ID}:${API_KEY}`).toString('base64'));
    expect(surface).not.toContain('19.2');
    expect(surface).not.toContain('1990');
  });
});
