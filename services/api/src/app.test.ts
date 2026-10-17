import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { apiErrorSchema, MAX_BODY_BYTES } from '@astro/shared';
import { buildApp } from './app.js';
import { loadConfig } from './common/config.js';
import { AppError } from './common/errors.js';

const config = loadConfig({
  APP_ENV: 'test',
  ASTRO_PROVIDER: 'mock',
  UID_HASH_PEPPER: randomBytes(32).toString('base64'),
  FIREBASE_PROJECT_ID: 'demo-astro-app',
  APP_CHECK_ENFORCED: 'false',
  LOG_LEVEL: 'info',
});

let app: FastifyInstance;
let logLines: string[];

beforeEach(async () => {
  logLines = [];
  app = buildApp(config, {
    deps: {
      verifier: {
        verifyIdToken: () => Promise.reject(new Error('not used in these tests')),
        verifyAppCheckToken: () => Promise.reject(new Error('not used in these tests')),
      },
    },
    logStream: { write: (line) => logLines.push(line) },
  });

  // Test-only routes exercising each error path.
  app.post('/echo', (request) => ({ received: request.body }));
  app.get('/app-error', () => {
    throw new AppError('PROFILE_LIMIT_REACHED', 409, 'Profile limit reached');
  });
  app.get('/quota', () => {
    throw new AppError('QUOTA_EXCEEDED', 429, 'Daily limit reached', {
      retryable: true,
      headers: { 'retry-after': '3600' },
    });
  });
  app.get('/zod-error', () =>
    z.strictObject({ hour: z.number().max(23, 'INVALID_TIME') }).parse({ hour: 30 }),
  );
  app.get('/crash', () => {
    throw Object.assign(new Error('db exploded at /internal/path'), {
      profile: { birthDate: '1990-05-10', lat: 19.0728 },
    });
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

function expectErrorShape(body: unknown) {
  const parsed = apiErrorSchema.safeParse(body);
  expect(parsed.success, JSON.stringify(body)).toBe(true);
  return parsed.data?.error;
}

describe('GET /healthz', () => {
  it('returns ok with security headers and a server-generated request id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'client-chosen-id' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['strict-transport-security']).toContain('max-age=');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-request-id']).not.toBe('client-chosen-id');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('error handling', () => {
  it('unknown route: 404 NOT_FOUND in the stable shape, with security headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(expectErrorShape(res.json())?.code).toBe('NOT_FOUND');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('malformed JSON: 400 VALIDATION_FAILED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{"name": ',
    });
    expect(res.statusCode).toBe(400);
    expect(expectErrorShape(res.json())?.code).toBe('VALIDATION_FAILED');
  });

  it('empty JSON body: 400 VALIDATION_FAILED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });
    expect(res.statusCode).toBe(400);
    expect(expectErrorShape(res.json())?.code).toBe('VALIDATION_FAILED');
  });

  it('body over 16 KB: 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES) }),
    });
    expect(res.statusCode).toBe(413);
    expect(expectErrorShape(res.json())?.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('body just under 16 KB is accepted', async () => {
    const payload = JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES - 20) });
    expect(Buffer.byteLength(payload)).toBeLessThanOrEqual(MAX_BODY_BYTES);
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(res.statusCode).toBe(200);
  });

  it('unsupported content type: 415', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/xml' },
      payload: '<a/>',
    });
    expect(res.statusCode).toBe(415);
    expectErrorShape(res.json());
  });

  it('AppError keeps its status and code', async () => {
    const res = await app.inject({ method: 'GET', url: '/app-error' });
    expect(res.statusCode).toBe(409);
    expect(expectErrorShape(res.json())).toMatchObject({
      code: 'PROFILE_LIMIT_REACHED',
      retryable: false,
    });
  });

  it('AppError headers reach the response (Retry-After on 429)', async () => {
    const res = await app.inject({ method: 'GET', url: '/quota' });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('3600');
    expect(expectErrorShape(res.json())).toMatchObject({ code: 'QUOTA_EXCEEDED', retryable: true });
  });

  it('ZodError becomes 400 with field-level details', async () => {
    const res = await app.inject({ method: 'GET', url: '/zod-error' });
    expect(res.statusCode).toBe(400);
    expect(expectErrorShape(res.json())?.details).toEqual([{ path: 'hour', code: 'INVALID_TIME' }]);
  });

  it('unexpected error: 500 INTERNAL with no message, stack or data leaked to the client', async () => {
    const res = await app.inject({ method: 'GET', url: '/crash' });
    expect(res.statusCode).toBe(500);
    const error = expectErrorShape(res.json());
    expect(error).toMatchObject({ code: 'INTERNAL', message: 'Internal error', retryable: true });
    expect(res.body).not.toContain('exploded');
    expect(res.body).not.toContain('/internal/path');
    expect(res.body).not.toContain('1990-05-10');
    expect(res.body).not.toMatch(/at .*\.ts/);
  });
});

describe('logging', () => {
  it('writes structured JSON with Cloud Logging severity', async () => {
    await app.inject({ method: 'GET', url: '/healthz' });
    const entries = logLines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => typeof e['severity'] === 'string')).toBe(true);
    expect(entries.some((e) => e['message'] === 'request completed')).toBe(true);
  });

  it('never logs query strings, auth headers or app check tokens', async () => {
    await app.inject({
      method: 'GET',
      url: '/v1/places?q=Varanasi',
      headers: { authorization: 'Bearer secret-id-token', 'x-firebase-appcheck': 'secret-ac' },
    });
    const all = logLines.join('\n');
    expect(all).not.toContain('Varanasi');
    expect(all).not.toContain('secret-id-token');
    expect(all).not.toContain('secret-ac');
    expect(all).toContain('/v1/places?[REDACTED]');
  });

  it('logs unexpected errors with stack for debugging but redacts birth data on the error', async () => {
    await app.inject({ method: 'GET', url: '/crash' });
    const all = logLines.join('\n');
    expect(all).toContain('unhandled error');
    expect(all).toContain('db exploded'); // our own message is useful to operators
    expect(all).toContain('"stack"');
    expect(all).not.toContain('1990-05-10');
    expect(all).not.toContain('19.0728');
  });
});
