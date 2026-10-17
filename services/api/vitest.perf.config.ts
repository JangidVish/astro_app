import { defineConfig } from 'vitest/config';

// Load test (T9.2): run on demand with `npm run test:perf`, not part of `npm test`.
export default defineConfig({
  test: {
    include: ['test/perf/**/*.perf.ts'],
    testTimeout: 600_000,
    hookTimeout: 120_000,
  },
});
