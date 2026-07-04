/**
 * One-off: copy the entire Turso database into a local SQLite file.
 *
 * Usage:
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... \
 *     pnpm --filter @tmw/server exec tsx scripts/migrate-from-turso.ts [destPath]
 *
 * destPath defaults to apps/server/data/app.db. Refuses to overwrite an
 * existing file — pick an explicit path (or move the old file away) instead.
 * Copies schema (incl. indexes) and data verbatim, plus __drizzle_migrations,
 * so the server boots against the file without re-running migrations.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type Client } from '@libsql/client';

// Creds: process env first, then the env files on this host — apps/server/.env
// (the container's runtime env-file) and the repo-root .env. The token var is
// historically named AUTH_TOKEN in some copies, accept both.
function fromEnvFiles(name: string): string | undefined {
  for (const file of ['../.env', '../../../.env']) {
    try {
      const text = fs.readFileSync(path.resolve(import.meta.dirname, file), 'utf8');
      const line = text.split(/\r?\n/).find((l) => l.startsWith(name + '='));
      if (line) return line.slice(name.length + 1).trim();
    } catch {
      // file missing — try the next one
    }
  }
  return undefined;
}

const srcUrl = process.env.TURSO_DATABASE_URL ?? fromEnvFiles('TURSO_DATABASE_URL');
const srcToken =
  process.env.TURSO_AUTH_TOKEN ??
  fromEnvFiles('TURSO_AUTH_TOKEN') ??
  fromEnvFiles('AUTH_TOKEN');
if (!srcUrl) {
  console.error('TURSO_DATABASE_URL not found in env, apps/server/.env or root .env');
  process.exit(1);
}

const destArg = process.argv[2];
const destPath = path.resolve(
  destArg ?? path.resolve(import.meta.dirname, '../data/app.db'),
);
if (fs.existsSync(destPath)) {
  console.error(`Destination already exists: ${destPath} — refusing to overwrite.`);
  process.exit(1);
}
fs.mkdirSync(path.dirname(destPath), { recursive: true });

const src: Client = createClient({ url: srcUrl, authToken: srcToken });
// libsql expects a file URL with forward slashes, even on Windows.
const dest: Client = createClient({ url: 'file:' + destPath.split(path.sep).join('/') });

// FKs off during import: tables are copied in arbitrary order.
await dest.execute('PRAGMA foreign_keys=OFF');

// Recreate schema exactly as it is on Turso (tables first, then indexes).
const schema = await src.execute(
  "SELECT type, name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END",
);
for (const row of schema.rows) {
  await dest.execute(String(row.sql));
}

const tables = schema.rows.filter((r) => r.type === 'table').map((r) => String(r.name));
let grandTotal = 0;
for (const table of tables) {
  const data = await src.execute(`SELECT * FROM "${table}"`);
  if (data.rows.length === 0) {
    console.log(`${table}: 0 rows`);
    continue;
  }
  const cols = data.columns;
  const placeholders = `(${cols.map(() => '?').join(',')})`;
  const insert = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES ${placeholders}`;
  // Batch in transactions of 500 to keep memory and statement counts sane.
  for (let i = 0; i < data.rows.length; i += 500) {
    const chunk = data.rows.slice(i, i + 500);
    await dest.batch(
      chunk.map((row) => ({ sql: insert, args: cols.map((c) => row[c] ?? null) })),
      'write',
    );
  }
  console.log(`${table}: ${data.rows.length} rows`);
  grandTotal += data.rows.length;
}

// Verify: row counts must match on both sides.
let mismatch = false;
for (const table of tables) {
  const a = await src.execute(`SELECT count(*) AS n FROM "${table}"`);
  const b = await dest.execute(`SELECT count(*) AS n FROM "${table}"`);
  if (Number(a.rows[0]!.n) !== Number(b.rows[0]!.n)) {
    console.error(`MISMATCH in ${table}: turso=${a.rows[0]!.n} local=${b.rows[0]!.n}`);
    mismatch = true;
  }
}
await dest.execute('PRAGMA foreign_keys=ON');

if (mismatch) {
  console.error('Row counts differ — do NOT switch the server to this file.');
  process.exit(1);
}
console.log(`\nDone: ${grandTotal} rows -> ${destPath}`);
console.log('All row counts verified. Remove TURSO_* from the env and restart the server.');
