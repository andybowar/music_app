# CR F-02 · Run e2e on Vercel previews via `repository_dispatch`

**Status:** approved by project owner 2026-10-29.

## Problem

The e2e workflow never ran:

1. **No trigger.** `e2e.yml` listened for `deployment_status`. This Vercel project doesn't create GitHub Deployments (its `deployment_status` Events toggle is off), so the event never fires. Vercel now recommends its `repository_dispatch` events instead.
2. **Previews need a login.** Preview URLs redirect to Vercel's SSO (Deployment Protection), so Playwright would only see the login page.
3. **Gallery specs couldn't run.** `/dev/*` galleries called `notFound()` when `NODE_ENV=production`, which is true for every Vercel build, previews included. `tests/e2e/responsive-panel.spec.ts` would always skip there.

## Changes

| File | Owner | Change |
|---|---|---|
| `.github/workflows/e2e.yml` | F-02 | Trigger on `repository_dispatch` type `vercel.deployment.success`. Read `client_payload.url` and `client_payload.git.sha`. Skip production deployments. Post an `E2E (Vercel preview)` commit status so the result shows on the PR. `workflow_dispatch` kept for manual runs. |
| `playwright.config.ts` | F-01 | When `VERCEL_AUTOMATION_BYPASS_SECRET` is set, send `x-vercel-protection-bypass` and `x-vercel-set-bypass-cookie` headers. |
| `lib/devGallery.ts` (new) | this CR | `isDevGalleryEnabled()`: false only when `VERCEL_ENV=production`. |
| `app/dev/tokens/page.tsx` | UI-01 | Use `isDevGalleryEnabled()` instead of the `NODE_ENV` check. |
| `tests/e2e/responsive-panel.spec.ts` | UI-01 | Comment and skip message updated; behavior unchanged. |
| `contracts/ui.md` | contract | `/dev/[component]` row names the helper. |

## Setup (done)

- Vercel: Deployment Protection → Protection Bypass for Automation secret generated.
- GitHub: repository secret `VERCEL_AUTOMATION_BYPASS_SECRET` set to the same value.

## Affects

- Every future UI task's `/dev/<name>` page: use `if (!isDevGalleryEnabled()) notFound();`.
- Galleries become reachable on preview URLs. They render fixtures only.
- `repository_dispatch` only runs the workflow from `main`, so this can't be tested on its own PR; the first real run is the first preview deployment after merge.
