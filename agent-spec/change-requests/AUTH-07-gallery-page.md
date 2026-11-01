# CR AUTH-07 · Gallery page for SignupForm and AccountStatus

**Status:** proposed.

## Problem

AGENTS.md §5 asks for a `/dev/<name>` gallery page for new components, and AUTH-07's deliverables say "or a change request if no `app/dev/` path is owned". AUTH-07 owns no `app/dev/` path, and the gallery index (`app/dev/pages.ts`) belongs to another task.

## What AUTH-07 did instead

- The real pages need no fixtures and act as the gallery for most states:
  - `/signup` shows the empty form; submitting it empty shows validation errors; a submit shows the pending and success states.
  - `/account-status` shows the "awaiting approval" or "request declined" state for a signed-in pending or rejected user (seeded users, or one created through `/signup`).
- Unit tests render every state of both components (pending, rejected, approved, loading, error, validation, success) at the component level.

## Proposed change

```diff
-owns: ["app/(auth)/signup/", "app/(auth)/account-status/", "features/auth/ui/SignupForm.tsx", "features/auth/ui/AccountStatus.tsx"]
+owns: [..., "app/dev/auth-signup/"]
```

A follow-up adds `app/dev/auth-signup/page.tsx`. It would render `SignupForm` with a stubbed action and `AccountStatus` for each `AccessStatus`, and register the page in `app/dev/pages.ts` as a touch. Alternatively, the gallery owner adds it.

**Affects:** AUTH-07 (`tasks/AUTH-07.md`, `tasks.json`), and the owner of `app/dev/pages.ts`.
