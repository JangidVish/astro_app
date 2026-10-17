import { describe, expect, it } from 'vitest';
import { API_BASE_PATH } from './index.js';

describe('@astro/api', () => {
  it('resolves the shared workspace package', () => {
    expect(API_BASE_PATH).toBe('/v1');
  });
});
