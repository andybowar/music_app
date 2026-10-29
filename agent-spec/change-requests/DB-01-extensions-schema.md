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

### DB-02 example SQL (same CR, follow-up)

`contracts/schema.md` "Indexes (DB-02)" and "search_vector weights" now schema-qualify extension objects, so DB-02 can copy them as-is:

```diff
-create index songs_title_trgm     on songs using gin (lower(title) gin_trgm_ops);
+create index songs_title_trgm     on songs using gin (lower(title) extensions.gin_trgm_ops);
```

```diff
-Use config `english` with `unaccent`. Example:
+Use config `english` with `extensions.unaccent`. `unaccent` is only STABLE, so use it here, in the trigger function, and never in an index expression or generated column. Example:
-  ... unaccent(...) ...
+  ... extensions.unaccent(...) ...      (all four calls)
```

The contract uses `similarity` and the `%` operator nowhere, so there was nothing to qualify. If SRCH-01 uses them, write `extensions.similarity(...)` and `a operator(extensions.%) b`.

`unaccent` (STABLE) appears only in the trigger function, where STABLE is fine. The trigram index is on `lower(title)` (IMMUTABLE), so no IMMUTABLE wrapper is needed. If a later task wants an accent-insensitive expression index or generated column, it needs an IMMUTABLE wrapper that pins the dictionary. That would be a new change request.

I checked this on a fresh local stack after `pnpm db:migrate` (2026-10-28), in one transaction that was rolled back, with `set local search_path = ''`:

- All 12 DB-02 indexes were created.
- A `set search_path = ''` plpgsql trigger function holding the example `search_vector` expression was created, plus a BEFORE INSERT trigger.
- Inserting `'Café Grâce'` produced `'cafe':1A 'grace':2A ... 'jose':4C 'perez':5C`.
- `extensions.similarity` and `operator(extensions.%)` both worked.
- The one-argument `extensions.unaccent(text)` finds its dictionary even with an empty `search_path`.

## Affects

- **DB-02** (search triggers/indexes): done. The contract's DB-02 index and trigger SQL is now schema-qualified and verified (above), and can be copied as-is. `to_tsvector`/`setweight` are core (`pg_catalog`) and need no prefix.
- **SRCH-01**: runtime queries over `DATABASE_URL` or PostgREST already resolve `similarity()`/`unaccent()`. Qualifying them is still recommended.
- **DB-01**: `0001_init.sql` updated (not yet merged, so no migration is edited after merge).
