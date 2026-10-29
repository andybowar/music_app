import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit doesn't read .env.local the way Next does. Load it when present so
// `pnpm db:migrate` targets the same database as the app. CI sets DATABASE_URL
// directly. Fall back to the local Supabase stack (`pnpm db:start`).
if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

const LOCAL_SUPABASE_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema/index.ts',
  out: './db/migrations',
  // Only our tables. Supabase owns auth, storage, etc.
  schemaFilter: ['public'],
  dbCredentials: { url: process.env.DATABASE_URL ?? LOCAL_SUPABASE_DB },
  migrations: { schema: 'drizzle', table: '__drizzle_migrations' },
  strict: true,
  verbose: true,
});
