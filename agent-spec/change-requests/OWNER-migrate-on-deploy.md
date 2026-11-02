# CR OWNER · Run database migrations on every Vercel deploy

**Status:** approved by project owner 2026-11-02. Implemented in the same PR.

## Problem

Nothing applies migrations to the hosted Supabase projects. A Vercel build only runs `next build`, and CI migrates only its own throwaway database. Hosted projects therefore start with no tables, and every new migration needs a manual step that is easy to forget.

## Change

- `vercel.json` (new): `"buildCommand": "bash scripts/vercel-build.sh"`. Vercel only; local `pnpm build` and CI are unchanged.
- `scripts/vercel-build.sh` (new): if `MIGRATION_DATABASE_URL` is set, runs `pnpm db:migrate` with `DATABASE_URL` pointed at it, then `pnpm build`. Without it, logs that migrations were skipped and builds anyway.
- `MIGRATION_DATABASE_URL`: the Supabase **session pooler** string (port 5432). The app's `DATABASE_URL` stays on the transaction pooler (port 6543), which suits serverless functions but not drizzle-kit's migration run.
- Docs: `.env.example` (a commented entry) and `HUMAN-TASKS.md` sections 2 and 9.

## Behaviour

- Set per environment. Preview → staging project, Production → production project. Leave it out of an environment to keep migrations manual there.
- A failed migration fails the deploy, so code never ships ahead of its schema. The previous deployment stays live.
- Preview builds migrate staging, including PRs that never merge. A PR that adds a migration and is then abandoned leaves that change in staging. Acceptable for staging; note it in such PRs.
- Two deploys building at once could both try the same new migration. drizzle-kit takes no lock, so the second fails and can be redeployed. Rare with one maintainer.
- Migrations must be additive or safe for the code that is still live while the new build runs (the previous deployment keeps serving until the new one is ready).

## Affects

- **BR-03** owns `vercel.json`. It now exists with `buildCommand`; BR-03 adds its `crons` entry alongside and keeps the build command.
- **DB tasks adding migrations** (DB-0x and later CR-approved ones): migrations reach staging on the PR's preview build and production on merge.
- No contract changes. `drizzle.config.ts` is unchanged.
