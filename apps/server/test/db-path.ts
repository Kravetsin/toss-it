import os from 'node:os';
import path from 'node:path';

/**
 * The throwaway database every server test shares. A fixed path (not a random one) because the
 * config and the global setup both need to name the same file, and vitest evaluates them in
 * different processes — the setup wipes it, so a stale file from a previous run cannot leak in.
 */
export const TEST_DB_FILE = path.join(os.tmpdir(), 'tossit-server-test.db');

/** libsql wants a URL with forward slashes, even on Windows. */
export const TEST_DB_URL = `file:${TEST_DB_FILE.split(path.sep).join('/')}`;
