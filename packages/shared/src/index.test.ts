import { describe, expect, it } from 'vitest';
import { API_VERSION } from './index.js';

describe('@astro/shared', () => {
  it('exposes the API contract version', () => {
    expect(API_VERSION).toBe('v1');
  });
});
