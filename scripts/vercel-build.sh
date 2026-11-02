#!/usr/bin/env bash
# Vercel build command (vercel.json): apply pending DB migrations, then build.
# Migrations run only when MIGRATION_DATABASE_URL is set for the environment (Supabase
# session pooler, port 5432), so an environment without it still builds.
# A failed migration fails the deploy, so code never ships ahead of its schema.
# See change-requests/OWNER-migrate-on-deploy.md.
set -euo pipefail

if [ -n "${MIGRATION_DATABASE_URL:-}" ]; then
  echo "Applying database migrations (${VERCEL_ENV:-unknown} environment)"
  DATABASE_URL="$MIGRATION_DATABASE_URL" pnpm db:migrate
else
  echo "MIGRATION_DATABASE_URL is not set for ${VERCEL_ENV:-this} environment; skipping migrations"
fi

pnpm build
