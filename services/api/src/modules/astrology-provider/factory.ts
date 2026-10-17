import type { Config } from '../../common/config.js';
import { MockProvider } from './mock/mock-provider.js';
import type { AstrologyProvider } from './provider.js';

/**
 * Creates the provider selected by config.
 *
 * The prod check here duplicates the one in loadConfig on purpose: if config validation were
 * ever bypassed or changed, fabricated mock data still cannot reach production users (rule 10).
 */
export function createProvider(config: Config): AstrologyProvider {
  if (config.provider.kind === 'mock') {
    if (config.env === 'prod') {
      throw new Error('Refusing to create MockProvider in prod');
    }
    return new MockProvider();
  }
  // Wired up with the HTTP client and mappers in T3.3.
  throw new Error('AstrologyApiProvider is not implemented yet (T3.3)');
}
