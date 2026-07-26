import fs from 'node:fs';
import { TEST_DB_FILE, TEST_DB_URL } from './db-path';

/**
 * Start every run from an empty, freshly migrated database. Runs in the main process, where the
 * config's `env` has not been applied yet — hence setting the variable here too, before the module
 * that reads it is imported.
 */
export async function setup(): Promise<void> {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${TEST_DB_FILE}${suffix}`, { force: true });
  }
  process.env.TURSO_DATABASE_URL = TEST_DB_URL;
  const { runMigrations } = await import('../src/db/index');
  await runMigrations();
}
