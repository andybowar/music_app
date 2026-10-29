# CR DB-01 · Migration scripts, drivers and drizzle-kit journal

**Status:** approved by lead agent (2026-10-28), before implementation.

## Problem

DB-01 owns `db/schema/`, `db/migrations/0001_init.sql` and `drizzle.config.ts`, but generating and applying that migration needs things outside those paths:

1. `package.json` scripts so CI (`.github/workflows/ci.yml`, "Run migrations") and developers can run migrations. CI already calls `pnpm db:migrate` when the script exists.
2. drizzle-kit's bookkeeping files in `db/migrations/meta/` (`_journal.json`, `0001_snapshot.json`). `drizzle-kit migrate` reads the journal to find migrations; `drizzle-kit generate` diffs against the latest snapshot.

## Change

`package.json`:

```diff
+    "db:generate": "drizzle-kit generate",
+    "db:migrate": "drizzle-kit migrate",
```

Dependencies added (AGENTS.md §3 already allows adding deps): `drizzle-orm`, `postgres` (driver for `drizzle-kit migrate` and, later, `lib/db.ts`), dev `drizzle-kit`.

New files: `db/migrations/meta/_journal.json`, `db/migrations/meta/0001_snapshot.json`.

## Notes for later migration tasks (DB-02, DB-03, ...)

- drizzle-kit names files `<idx>_<name>.sql` with `idx = last journal idx + 1`. The first entry was renamed to idx `1` / tag `0001_init` (drizzle-kit would have called it `0000`), so the next `pnpm db:generate --name <x>` (or `--custom --name <x>` for hand-written SQL such as triggers and RLS) produces `0002_<x>.sql`.
- `0001_init.sql` starts with two hand-added statements, `create extension if not exists pg_trgm` / `unaccent` (both `with schema extensions`, see CR DB-01-extensions-schema), which drizzle-kit doesn't emit.
- Applied migrations are recorded in `drizzle.__drizzle_migrations`. `pnpm db:migrate` is idempotent.
- Fresh local DB: `pnpm db:start`, `pnpm db:reset`, `pnpm db:migrate`.

## Affects

- **F-02** CI: the existing "Run migrations" step now runs. No workflow change.
- **DB-02, DB-03** and later migration tasks: use `pnpm db:generate` as above.
