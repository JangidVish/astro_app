import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Config } from '../../common/config.js';
import { PROVIDER_ERROR_KINDS, ProviderError, providerErrorToAppError } from './errors.js';
import { createProvider } from './factory.js';
import { MockProvider } from './mock/mock-provider.js';

function config(overrides: Partial<Config>): Config {
  return {
    env: 'local',
    port: 8080,
    logLevel: 'silent',
    provider: { kind: 'mock' },
    uidHashPepper: randomBytes(32),
    firebaseProjectId: 'demo-astro-app',
    appCheckEnforced: false,
    quotaProviderCallsPerDay: 30,
    ...overrides,
  };
}

describe('createProvider', () => {
  it.each(['local', 'test', 'staging'] as const)('returns the mock in %s', (env) => {
    expect(createProvider(config({ env }))).toBeInstanceOf(MockProvider);
  });

  it('refuses the mock in prod even if config validation was bypassed', () => {
    expect(() => createProvider(config({ env: 'prod' }))).toThrow(/prod/);
  });

  it('fails loudly for the real provider until T3.3 wires it up', () => {
    expect(() =>
      createProvider(config({ provider: { kind: 'astrologyapi', userId: 'u', apiKey: 'k' } })),
    ).toThrow(/not implemented/);
  });
});

describe('providerErrorToAppError', () => {
  const expected = {
    timeout: ['PROVIDER_UNAVAILABLE', 503, true],
    network: ['PROVIDER_UNAVAILABLE', 503, true],
    server: ['PROVIDER_UNAVAILABLE', 503, true],
    auth: ['PROVIDER_UNAVAILABLE', 503, true],
    quota: ['PROVIDER_UNAVAILABLE', 503, true],
    rate_limited: ['PROVIDER_RATE_LIMITED', 503, true],
    bad_request: ['PROVIDER_ERROR', 502, false],
    malformed: ['PROVIDER_ERROR', 502, false],
  } as const;

  it.each(PROVIDER_ERROR_KINDS)('maps %s', (kind) => {
    const appError = providerErrorToAppError(new ProviderError(kind, 'planets'));
    expect([appError.code, appError.status, appError.retryable]).toEqual(expected[kind]);
  });

  it('flags only auth and quota failures for operator attention', () => {
    const flagged = PROVIDER_ERROR_KINDS.filter((k) => new ProviderError(k, 'x').needsOps);
    expect(flagged).toEqual(['auth', 'quota']);
  });

  it('user-facing messages never mention the provider endpoint or credentials', () => {
    for (const kind of PROVIDER_ERROR_KINDS) {
      const message = providerErrorToAppError(new ProviderError(kind, 'horo_chart/D1')).message;
      expect(message).not.toMatch(/horo_chart|astrologyapi|key|credential/i);
    }
  });
});
