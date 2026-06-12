import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import * as schema from './schema';

const serverRoot = path.resolve(import.meta.dirname, '../..');

/**
 * Локально — файл SQLite (file:...), в проде — Turso (libsql://... + токен).
 * Render free не имеет персистентного диска, поэтому БД живёт снаружи.
 */
function buildClient() {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  if (tursoUrl) {
    return createClient({ url: tursoUrl, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  const dataDir = path.join(serverRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  // libsql ждёт file-URL с прямыми слэшами, включая Windows-пути.
  const fileUrl = 'file:' + path.join(dataDir, 'app.db').split(path.sep).join('/');
  return createClient({ url: fileUrl });
}

export const db = drizzle(buildClient(), { schema });

export async function runMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: path.join(serverRoot, 'drizzle') });
}
