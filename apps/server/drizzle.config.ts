import { defineConfig } from 'drizzle-kit';

// DB_FILE overrides the dev default — e.g. pointing drizzle-kit studio at the prod
// file (or better, a backup snapshot) on the laptop. Forward slashes, even on Windows.
const dbFile = process.env.DB_FILE ?? 'data/app.db';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: `file:${dbFile.replace(/\\/g, '/')}`,
  },
});
