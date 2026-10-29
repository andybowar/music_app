# CR DB-01 · Install extensions in the `extensions` schema

**Status:** approved by project owner 2026-10-28. Contract and `db/migrations/0001_init.sql` updated in the same commit.

## Problem

`contracts/schema.md` created `pg_trgm` and `unaccent` with plain `create extension if not exists ...`. On Supabase that puts them in `public`. Supabase convention, which its database advisor checks for, is the `extensions` schema. That keeps extension objects out of the API-exposed `public` schema.

## Contract diff

`contracts/schema.md`, "Extensions & enums":

```diff
+Extensions live in Supabase's `extensions` schema, not `public`, so their functions and operator classes are reached through that schema. The `postgres` role, which runs migrations and is the `DATABASE_URL` user, has `extensions` on its `search_path`. PostgREST adds it for API requests via `extra_search_path` in `supabase/config.toml`. DDL that can run with a different or empty `search_path` must schema-qualify, for example `extensions.gin_trgm_ops` in index opclasses, or `extensions.unaccent(...)` in generated columns, index expressions and trigger functions (especially `set search_path = ''` functions).
+
 ```sql
-create extension if not exists pg_trgm;
-create extension if not exists unaccent;
+create extension if not exists pg_trgm with schema extensions;
+create extension if not exists unaccent with schema extensions;
```

I checked the search_path claims on the local stack (2026-10-28):

- The `postgres` role has `search_path = "$user", public, extensions`.
- A PostgREST RPC call made as `anon` saw `"public", "public", "extensions"`.

The server default is `"$user", public`, which doesn't include `extensions`.

No `create schema if not exists extensions` is needed or added: Supabase creates that schema on the local stack, in CI (which uses the same stack) and on hosted projects.

## Affects

- **DB-02** (search triggers/indexes): qualify extension objects. Use `lower(title) extensions.gin_trgm_ops` in `songs_title_trgm`, and `extensions.unaccent(...)` in the `search_vector` trigger function. The unqualified example SQL in the contract's DB-02 sections still works under the `postgres` role's search_path. It breaks, though, if the trigger function pins `search_path` or a dump is restored with an empty one. `to_tsvector`/`setweight` are core (`pg_catalog`) and need no prefix.
- **SRCH-01**: runtime queries over `DATABASE_URL` or PostgREST already resolve `similarity()`/`unaccent()`. Qualifying them is still recommended.
- **DB-01**: `0001_init.sql` updated (not yet merged, so no migration is edited after merge).
