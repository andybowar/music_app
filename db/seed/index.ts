/**
 * `pnpm exec tsx db/seed/index.ts [--force]` (DB-04). Loads fixtures into the local database.
 *
 * Needs a migrated local stack (`pnpm db:start && pnpm db:migrate`) and, from the
 * environment or `.env.local`: DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY. Refuses non-localhost targets unless `--force` is passed.
 *
 * Every seeded user signs in with email + the dev password in `./data.ts` (DEV_PASSWORD).
 */
import { existsSync } from 'node:fs';

import { seed } from './seed';

if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const args = process.argv.slice(2);
const unknown = args.filter((a) => a !== '--force');
if (unknown.length) {
  console.error(`Unknown argument(s): ${unknown.join(' ')}. Usage: db/seed/index.ts [--force]`);
  process.exit(2);
}

seed({
  databaseUrl: process.env.DATABASE_URL,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  force: args.includes('--force'),
  log: (m) => console.log(`  ${m}`),
}).then(
  () => console.log('Seed complete.'),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
