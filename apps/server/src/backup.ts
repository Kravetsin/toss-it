import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { db } from './db/index';

const KEEP_BACKUPS = 14;
const CHECK_INTERVAL_MS = 60 * 60_000;

/**
 * Daily SQLite snapshot via VACUUM INTO (safe on a live database) — the laptop's
 * disk is the only copy of everything once Turso is gone. Point BACKUP_DIR at a
 * cloud-synced folder (OneDrive etc.) for offsite copies. No-op on Turso.
 */
export function startBackups(serverRoot: string, log: FastifyBaseLogger): void {
  if (process.env.TURSO_DATABASE_URL) return; // remote DB has its own durability
  const dir = process.env.BACKUP_DIR ?? path.join(serverRoot, 'data', 'backups');

  const sweep = async (): Promise<void> => {
    const name = `app-${new Date().toISOString().slice(0, 10)}.db`;
    const target = path.join(dir, name);
    if (fs.existsSync(target)) return; // today's snapshot already taken
    fs.mkdirSync(dir, { recursive: true });
    // VACUUM INTO wants a non-existent file and a SQL-string path (no binding).
    const fileUrl = target.split(path.sep).join('/').replace(/'/g, "''");
    await db.run(sql.raw(`VACUUM INTO '${fileUrl}'`));
    log.info({ target }, 'sqlite backup written');

    const old = fs
      .readdirSync(dir)
      .filter((f) => /^app-\d{4}-\d{2}-\d{2}\.db$/.test(f))
      .sort()
      .slice(0, -KEEP_BACKUPS);
    for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  };

  const tick = () => void sweep().catch((err) => log.error({ err }, 'sqlite backup failed'));
  tick(); // snapshot on boot if today's is missing (laptop restarts are irregular)
  setInterval(tick, CHECK_INTERVAL_MS).unref();
}
