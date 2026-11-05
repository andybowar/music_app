---
id: OPS-04
title: "Move hosting from Vercel to Google Cloud Run (keep Supabase)"
phase: 5
wave: 6
stream: ops
size: L
status: todo
human_required: false
depends_on: ["OPS-01", "OPS-02"]
blocks: []
owns: ["Dockerfile", ".dockerignore", "deploy/", "docs/ops/google-cloud.md"]
touches: [".github/workflows/deploy.yml", "next.config.ts", "lib/env.ts", ".env.example", "features/auth/authOrigin.ts", "features/auth/authOrigin.test.ts", "middleware.ts", "lib/devGallery.ts", "features/bugs/server.ts", "sentry.server.config.ts", "sentry.edge.config.ts", "instrumentation-client.ts", ".github/workflows/e2e.yml", "scripts/vercel-build.sh", "vercel.json", "agent-spec/HUMAN-TASKS.md", "docs/ops/environments.md"]
requirements: ["REQ-NF-04"]
---

# OPS-04 · Move hosting from Vercel to Google Cloud Run (keep Supabase)


**Goal.** The app runs on the owner's organization's Google Cloud (enterprise account) instead of Vercel. Supabase stays for the database, auth and storage. Requested by the project owner on 2026-11-05: the organization already has Google Cloud, and the Vercel free plan is close to its monthly CDN request limit. Most of that load was the e2e suite, moved off Vercel in PR #174.

## Prerequisites (owner / IT team)
`HUMAN-TASKS.md` §15 lists what the IT team sets up: projects, APIs, Artifact Registry, service accounts, Workload Identity Federation for GitHub Actions, Secret Manager, the domain and the region. This task's code work can start before that, but deploying needs it.

## Design
- **Runtime:** Cloud Run (one service per environment: `music-app-staging`, `music-app-prod`). Image built from a multi-stage `Dockerfile` using Next.js `output: 'standalone'`, pushed to Artifact Registry. `PORT` comes from Cloud Run.
- **Deploys:** `.github/workflows/deploy.yml`.
  - On push to `main`: build → migrate → deploy production.
  - On push to `staging`: the same against staging.
  - Authentication is Workload Identity Federation; no JSON keys in GitHub.
- **Migrations:** `pnpm db:migrate` with `MIGRATION_DATABASE_URL` (Supabase session pooler) runs in the workflow **before** the new revision takes traffic. A failed migration stops the deploy, as `scripts/vercel-build.sh` does today. Keep "add before you remove" (AGENTS.md §3).
- **Cron:** Cloud Scheduler calls `GET /api/cron/usage` daily at 09:00 UTC with `Authorization: Bearer $CRON_SECRET` (the route already checks it).
- **Environment detection:** replace the `VERCEL_*` variables with our own, set at deploy time:
  - `APP_ENV`: `production` / `staging` / `development`. Replaces `VERCEL_ENV` in `middleware.ts` (canonical host), `lib/devGallery.ts`, Sentry configs and `instrumentation-client.ts`.
  - `APP_VERSION`: the git SHA. Replaces `VERCEL_GIT_COMMIT_SHA` in `features/bugs/server.ts` and Sentry's release.
  - `authOrigin.ts`: on Cloud Run each environment has one address (`APP_URL`), so the deployment/branch-URL allowance can go. Keep localhost for development. Keep reading the `VERCEL_*` variables as a fallback until Vercel is switched off, so both hosts work during the move.
- **Database connection:** unchanged (`DATABASE_URL` = Supabase transaction pooler, `prepare: false` from PR #171).
- **Previews:** none per PR at first. CI's "E2E (local build)" covers PRs, and staging is the shared preview. Optional later: tagged Cloud Run revisions per PR.
- **Logs:** Cloud Logging (structured JSON from `lib/log.ts` works as is). Sentry unchanged.

## Deliverables
- [ ] `output: 'standalone'` in `next.config.ts`, plus `Dockerfile` and `.dockerignore`. The image runs `node server.js`, includes `public/` and `.next/static`, and keeps the service worker (`public/sw.js`) and `outputFileTracingIncludes`.
- [ ] `APP_ENV` / `APP_VERSION` in `lib/env.ts` and `.env.example`, used everywhere `VERCEL_*` is today, with a fallback to `VERCEL_*`, and unit tests.
- [ ] `.github/workflows/deploy.yml`: auth via WIF, build and push, migrate, `gcloud run deploy` with env and secrets from Secret Manager, a smoke check (`/login` returns 200), and a rollback note.
- [ ] `deploy/`: the Cloud Scheduler job definition (or `gcloud` commands) and service settings (min instances 1 for production to avoid cold starts, max instances, CPU and memory, request timeout).
- [ ] `docs/ops/google-cloud.md`: architecture, how to deploy and roll back, logs, secrets, Scheduler, and how to switch the domain.
- [ ] `e2e.yml`: the manual run documented against the Cloud Run staging URL.
- [ ] Cut-over checklist:
  - Staging on Cloud Run is verified (sign-in, Google SSO, uploads and PDFs, the offline player, the cron run).
  - Production deployed and verified.
  - `APP_URL` and Supabase URL configuration updated (Site URL and redirect URLs, per HUMAN-TASKS §3).
  - DNS switched, and the Vercel project paused (not deleted) for two weeks.
- [ ] After the cut-over: remove `vercel.json`, `scripts/vercel-build.sh` and the `VERCEL_*` fallbacks.

## Acceptance criteria
- [ ] Staging and production run on Cloud Run with the same behaviour as on Vercel. The e2e suite passes when run manually against the staging URL.
- [ ] Migrations run before traffic shifts; a failed migration leaves the old revision serving.
- [ ] The daily usage job runs from Cloud Scheduler (seen in the logs).
- [ ] No long-lived Google credentials in GitHub.
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied.

## Out of scope
- Moving the database, auth or storage off Supabase (Cloud SQL, Identity Platform, Cloud Storage): a much bigger change, not needed for the goal.
