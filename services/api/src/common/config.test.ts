import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const PEPPER = randomBytes(32).toString('base64');

const base = {
  APP_ENV: 'local',
  ASTRO_PROVIDER: 'mock',
  UID_HASH_PEPPER: PEPPER,
  FIREBASE_PROJECT_ID: 'demo-astro-app',
  APP_CHECK_ENFORCED: 'false',
};

function problems(env: Record<string, string | undefined>): string[] {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return [...error.problems];
    throw error;
  }
  return [];
}

describe('loadConfig', () => {
  it('loads a valid local config with defaults', () => {
    const config = loadConfig(base);
    expect(config.env).toBe('local');
    expect(config.port).toBe(8080);
    expect(config.provider).toEqual({ kind: 'mock' });
    expect(config.quotaProviderCallsPerDay).toBe(30);
    expect(config.uidHashPepper.length).toBe(32);
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('loads a valid prod config', () => {
    const config = loadConfig({
      ...base,
      APP_ENV: 'prod',
      ASTRO_PROVIDER: 'astrologyapi',
      ASTROLOGYAPI_USER_ID: 'user',
      ASTROLOGYAPI_API_KEY: 'key',
      APP_CHECK_ENFORCED: 'true',
    });
    expect(config.provider.kind).toBe('astrologyapi');
    expect(config.appCheckEnforced).toBe(true);
  });

  it('defaults APP_CHECK_ENFORCED to true when unset', () => {
    expect(loadConfig({ ...base, APP_CHECK_ENFORCED: undefined }).appCheckEnforced).toBe(true);
  });

  it('reports every missing required variable by name', () => {
    const found = problems({});
    for (const name of ['APP_ENV', 'ASTRO_PROVIDER', 'UID_HASH_PEPPER', 'FIREBASE_PROJECT_ID']) {
      expect(found.some((p) => p.startsWith(`${name}:`))).toBe(true);
    }
  });

  it('LISTEN_ON_LAN is off by default and allowed only for local development', () => {
    expect(loadConfig(base).listenOnLan).toBe(false);
    expect(loadConfig({ ...base, LISTEN_ON_LAN: 'true' }).listenOnLan).toBe(true);
    for (const env of ['test', 'staging']) {
      expect(problems({ ...base, APP_ENV: env, LISTEN_ON_LAN: 'true' })).toContain(
        'LISTEN_ON_LAN: is for local development only',
      );
    }
  });

  it('refuses the mock provider in prod', () => {
    const found = problems({ ...base, APP_ENV: 'prod', APP_CHECK_ENFORCED: 'true' });
    expect(found).toContain('ASTRO_PROVIDER: mock provider is not allowed in prod');
  });

  it.each(['staging', 'prod'])('refuses App Check disabled in %s', (env) => {
    const found = problems({
      ...base,
      APP_ENV: env,
      ASTRO_PROVIDER: 'astrologyapi',
      ASTROLOGYAPI_USER_ID: 'u',
      ASTROLOGYAPI_API_KEY: 'k',
      APP_CHECK_ENFORCED: 'false',
    });
    expect(found).toContain('APP_CHECK_ENFORCED: must be true in staging and prod');
  });

  it('requires AstrologyAPI credentials when that provider is selected', () => {
    const found = problems({ ...base, ASTRO_PROVIDER: 'astrologyapi' });
    expect(found).toContain('ASTROLOGYAPI_USER_ID: required when ASTRO_PROVIDER=astrologyapi');
    expect(found).toContain('ASTROLOGYAPI_API_KEY: required when ASTRO_PROVIDER=astrologyapi');
  });

  it('rejects a pepper shorter than 32 bytes', () => {
    const found = problems({ ...base, UID_HASH_PEPPER: randomBytes(16).toString('base64') });
    expect(found.some((p) => p.startsWith('UID_HASH_PEPPER:'))).toBe(true);
  });

  it.each([
    ['PORT', 'not-a-number'],
    ['PORT', '70000'],
    ['APP_ENV', 'production'],
    ['APP_CHECK_ENFORCED', 'yes'],
  ])('rejects invalid %s=%s', (name, value) => {
    expect(problems({ ...base, [name]: value }).some((p) => p.startsWith(`${name}:`))).toBe(true);
  });

  it('never includes variable values in the error message', () => {
    // Distinctive marker values, built at runtime so no credential-shaped literal is committed.
    const pepperValue = Buffer.from('marker-pepper-too-short').toString('base64');
    const apiKeyValue = `marker-key-${randomBytes(4).toString('hex')}`;
    const portValue = 'marker-port-value';
    try {
      loadConfig({
        ...base,
        UID_HASH_PEPPER: pepperValue,
        ASTRO_PROVIDER: 'astrologyapi',
        ASTROLOGYAPI_API_KEY: apiKeyValue,
        PORT: portValue,
      });
      expect.unreachable('config should be invalid');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as Error).message;
      expect(message).not.toContain(pepperValue);
      expect(message).not.toContain(apiKeyValue);
      expect(message).not.toContain(portValue);
      expect(message).not.toContain('marker');
    }
  });
});
