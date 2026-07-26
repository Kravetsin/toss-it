import { defineConfig } from 'vitest/config';
import { TEST_DB_URL } from './test/db-path';

/**
 * Server tests run against a REAL SQLite file, not a mocked drizzle: the queries are half the
 * behaviour worth testing, and a local libsql file beats the mocks on both speed and honesty.
 * TURSO_DATABASE_URL is what db/index.ts reads first, so pointing it at a file:// path swaps the
 * whole database without the code knowing.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: { TURSO_DATABASE_URL: TEST_DB_URL, NODE_ENV: 'test' },
    globalSetup: ['./test/global-setup.ts'],
    // One database file for the whole run, so files must not race over it. Tests stay apart by
    // creating their own channel instead (see makeChannel).
    fileParallelism: false,
  },
});
