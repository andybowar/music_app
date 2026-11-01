# CR OPS-02 · Client Sentry under Turbopack, React render errors, staging test route, env docs

**Status:** approved by project owner 2026-11-01. Applied to `tasks/OPS-02.md` owns/touches; the files themselves are an OPS-02 follow-up.

## Problem

OPS-02 owns `sentry.*.config.ts`, `instrumentation.ts` and `lib/log.ts`. With `@sentry/nextjs` 11
and Next 15 that leaves four gaps that need files outside those paths:

1. **Client init under Turbopack.** `sentry.client.config.ts` is only injected by the webpack build
   (`next build`, which is what Vercel runs), so production is covered. `next dev --turbopack`
   only loads `instrumentation-client.ts`, so browser errors are not reported in dev. Sentry logs
   a deprecation warning for `sentry.client.config.ts` at build time.
2. **React render errors in the App Router.** Errors caught by Next's default error boundary
   never reach Sentry without an `app/global-error.tsx` that calls `Sentry.captureException`.
   Sentry warns about this at build time.
3. **Verifying "Test error appears in Sentry staging".** There is no server endpoint that throws
   on demand; `/dev/*` pages 404 in production builds, so they can't be used on staging.
4. **Env docs.** `.env.example` (F-05) lists `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` but not the
   build-time variables `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` used by
   `next.config.ts` for source-map upload.

## Proposed diff

`tasks/OPS-02.md` (or a follow-up task), owns:

```diff
-owns: ["sentry.*.config.ts", "instrumentation.ts", "lib/log.ts"]
+owns: ["sentry.*.config.ts", "instrumentation.ts", "instrumentation-client.ts", "lib/log.ts", "app/global-error.tsx", "app/api/debug/sentry/"]
+touches: [..., ".env.example"]
```

Then:

- Rename `sentry.client.config.ts` → `instrumentation-client.ts` (same content, plus
  `export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;`).
- Add `app/global-error.tsx`: a client component that calls `Sentry.captureException(error)` in
  an effect and renders a plain "Something went wrong" page with a retry button.
- Add `app/api/debug/sentry/route.ts`: `GET` throws `new Error('Sentry test error')` only when the
  request carries `Authorization: Bearer ${CRON_SECRET}`; otherwise 404. Lets the owner trigger
  a server error on staging without exposing it publicly.
- `.env.example`, Monitoring section, add `SENTRY_AUTH_TOKEN=`, `SENTRY_ORG=`, `SENTRY_PROJECT=`
  (build-time only; source maps upload when the token is set).

## Affects

- OPS-02 only. No contract or behaviour change for other tasks.

## Workaround until approved

Production/staging builds use webpack, so client and server reporting already work there. To
verify on staging today: set `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` in Vercel (Preview), deploy,
then in the browser console on any page run
`setTimeout(() => { throw new Error('Sentry test error (client)') })`; the event should appear in
Sentry within a minute, with `environment: preview` and no email or cookies on it.
