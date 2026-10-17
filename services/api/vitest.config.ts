import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one Firestore emulator and reset it in beforeEach; running files in
    // parallel lets one file wipe another's data mid-test. Run files one at a time.
    fileParallelism: false,
    // Java emulators compete for CPU while tests run; the first test in a file can take several
    // seconds just loading firebase-admin on Windows. 15 s still catches genuine hangs.
    testTimeout: 15_000,
  },
});
