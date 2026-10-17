import type { Config } from '../../common/config.js';
import { AstrologyApiClient, type ProviderCallRecord } from './astrologyapi/client.js';
import { AstrologyApiProvider } from './astrologyapi/astrologyapi-provider.js';
import { MockProvider } from './mock/mock-provider.js';
import type { AstrologyProvider } from './provider.js';

export interface ProviderDeps {
  /** Receives per-attempt call metadata (for the providerCalls log). */
  onCall?: (record: ProviderCallRecord) => void;
  /** Test hook: replaces global fetch for the real provider. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Creates the provider selected by config.
 *
 * The prod check here duplicates the one in loadConfig on purpose: if config validation were
 * ever bypassed or changed, fabricated mock data still cannot reach production users (rule 10).
 */
export function createProvider(config: Config, deps: ProviderDeps = {}): AstrologyProvider {
  if (config.provider.kind === 'mock') {
    if (config.env === 'prod') {
      throw new Error('Refusing to create MockProvider in prod');
    }
    return new MockProvider();
  }
  const client = new AstrologyApiClient({
    userId: config.provider.userId,
    apiKey: config.provider.apiKey,
    ...(deps.onCall ? { onCall: deps.onCall } : {}),
    ...(deps.fetch ? { fetch: deps.fetch } : {}),
  });
  return new AstrologyApiProvider(client);
}
