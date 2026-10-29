# CR DB-04 · `pnpm db:seed` script

**Status:** proposed (needs approval).

## Problem

DB-04's goal is "`pnpm db:seed` loads fixtures into a local database", but DB-04 owns only `db/seed/`, so it can't add the script to `package.json`. The seed is TypeScript that imports `@/fixtures` and `@/db/schema` through the `@/*` path alias, so plain `node` can't run it. DB-04 added `tsx` as a devDependency (adding deps is allowed by AGENTS.md §3), which handles TypeScript, the tsconfig path alias and JSON imports.

Until this is approved, run the seed directly:

```bash
pnpm exec tsx db/seed/index.ts          # local only
pnpm exec tsx db/seed/index.ts --force  # allow a non-localhost target (don't)
```

## Proposed diff

`package.json`:

```diff
     "db:migrate": "drizzle-kit migrate",
+    "db:seed": "tsx db/seed/index.ts"
```

Optional, for a one-step fresh local DB:

```diff
+    "db:fresh": "supabase db reset && drizzle-kit migrate && tsx db/seed/index.ts"
```

No `supabase/config.toml` change is needed. The seed doesn't use `supabase db reset`'s `seed.sql` hook, because it needs the admin API to create auth users.

## Affects

- **AUTH-01, LIB-01, SRCH-01, SRCH-10, BR-01, DB-05**: their acceptance criteria test "against seed" and can call `pnpm db:seed` (or the direct command above).
- **F-02** CI: none required. `db/seed/seed.int.test.ts` runs the seed itself in the integration job.
