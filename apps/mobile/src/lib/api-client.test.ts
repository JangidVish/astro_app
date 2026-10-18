import { ApiError, createApiClient } from './api-client';
import { devHostFrom, resolveApiBaseUrl, resolveAuthEmulatorUrl } from './config';

type Recorded = { url: string; init: RequestInit };

function clientWith(
  respond: (url: string, init: RequestInit) => Promise<Response> | Response,
  opts: { token?: string | null; appCheck?: string | null; timeoutMs?: number } = {},
) {
  const calls: Recorded[] = [];
  const client = createApiClient({
    baseUrl: 'https://api.example.test',
    getIdToken: () => Promise.resolve(opts.token === undefined ? 'id-token-123' : opts.token),
    getAppCheckToken: () => Promise.resolve(opts.appCheck ?? null),
    timeoutMs: opts.timeoutMs ?? 1000,
    fetch: ((input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, init });
      return Promise.resolve(respond(url, init));
    }) as typeof fetch,
  });
  return { client, calls };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const me = {
  displayName: null,
  consent: null,
  consentRequired: true,
  primaryProfileId: null,
  profileCount: 0,
};

describe('api client: requests', () => {
  it('sends the ID token and App Check token, and parses the response with the shared schema', async () => {
    const { client, calls } = clientWith(() => json(200, me), { appCheck: 'ac-1' });
    await expect(client.getMe()).resolves.toEqual(me);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(calls[0]?.url).toBe('https://api.example.test/v1/me');
    expect(headers['authorization']).toBe('Bearer id-token-123');
    expect(headers['x-firebase-appcheck']).toBe('ac-1');
  });

  it('omits Authorization when signed out', async () => {
    const { client, calls } = clientWith(() => json(200, { status: 'ok' }), { token: null });
    await client.health();
    expect((calls[0]?.init.headers as Record<string, string>)['authorization']).toBeUndefined();
  });

  it('encodes path and query parameters', async () => {
    const { client, calls } = clientWith(() => json(200, { places: [] }));
    await client.searchPlaces('São Paulo & co');
    expect(calls[0]?.url).toBe('https://api.example.test/v1/places?q=S%C3%A3o%20Paulo%20%26%20co');
  });

  it('sends JSON bodies and treats 204 as success', async () => {
    const { client, calls } = clientWith(() => new Response(null, { status: 204 }));
    await expect(client.deleteProfile('abcDEF1234567890abcd')).resolves.toBeUndefined();
    expect(calls[0]?.init.method).toBe('DELETE');
  });
});

describe('api client: errors', () => {
  it('maps API error bodies to ApiError with the stable code and field details', async () => {
    const { client } = clientWith(() =>
      json(400, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          retryable: false,
          details: [{ path: 'birthTime', code: 'TIME_IN_DST_GAP' }],
        },
      }),
    );
    const error = (await client.getMe().catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect([error.code, error.status, error.retryable]).toEqual(['VALIDATION_FAILED', 400, false]);
    expect(error.details).toEqual([{ path: 'birthTime', code: 'TIME_IN_DST_GAP' }]);
  });

  it('network failure -> NETWORK, retryable', async () => {
    const { client } = clientWith(() => Promise.reject(new TypeError('Network request failed')));
    await expect(client.getMe()).rejects.toMatchObject({ code: 'NETWORK', retryable: true });
  });

  it('slow server -> TIMEOUT', async () => {
    const { client } = clientWith(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
      { timeoutMs: 20 },
    );
    await expect(client.getMe()).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it.each([
    ['non-JSON body', () => new Response('<html>502</html>', { status: 502 })],
    ['error body in an unknown shape', () => json(500, { oops: true })],
    ['success body not matching the contract', () => json(200, { displayName: 42 })],
  ])('%s -> INVALID_RESPONSE', async (_label, respond) => {
    const { client } = clientWith(respond);
    await expect(client.getMe()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('never puts the token in error messages', async () => {
    const { client } = clientWith(() => json(500, { oops: true }));
    const error = (await client.getMe().catch((e: unknown) => e)) as ApiError;
    expect(JSON.stringify({ message: error.message, code: error.code })).not.toContain(
      'id-token-123',
    );
  });
});

describe('resolveApiBaseUrl', () => {
  it('defaults to the local API in development', () => {
    expect(resolveApiBaseUrl(undefined, true)).toBe('http://127.0.0.1:8080');
  });
  it('strips trailing slashes', () => {
    expect(resolveApiBaseUrl('https://api.example.test//', false)).toBe('https://api.example.test');
  });
  it('requires a URL for release builds', () => {
    expect(() => resolveApiBaseUrl('', false)).toThrow(/must be set/);
  });
  it('requires https for release builds', () => {
    expect(() => resolveApiBaseUrl('http://api.example.test', false)).toThrow(/https/);
  });
  it('uses the dev machine address in development, so a real phone reaches the API', () => {
    expect(resolveApiBaseUrl(undefined, true, '192.168.0.105')).toBe('http://192.168.0.105:8080');
    expect(resolveApiBaseUrl('http://10.0.0.9:9000', true, '192.168.0.105')).toBe(
      'http://10.0.0.9:9000',
    );
  });
});

describe('devHostFrom', () => {
  it.each([
    ['192.168.0.105:8081', '192.168.0.105'],
    ['localhost:8081', 'localhost'],
    [undefined, '127.0.0.1'],
    [null, '127.0.0.1'],
    ['', '127.0.0.1'],
  ])('%j -> %s', (hostUri, host) => {
    expect(devHostFrom(hostUri)).toBe(host);
  });
});

describe('resolveAuthEmulatorUrl', () => {
  it('"auto" points at the Auth emulator on the dev machine', () => {
    expect(resolveAuthEmulatorUrl('auto', true, '192.168.0.105')).toBe('http://192.168.0.105:9099');
  });
  it('keeps an explicit URL and leaves the emulator off when unset', () => {
    expect(resolveAuthEmulatorUrl('http://10.0.2.2:9099', true)).toBe('http://10.0.2.2:9099');
    expect(resolveAuthEmulatorUrl(undefined, true)).toBeUndefined();
  });
  it('never uses an emulator in release builds', () => {
    expect(resolveAuthEmulatorUrl('auto', false, '192.168.0.105')).toBeUndefined();
  });
});
