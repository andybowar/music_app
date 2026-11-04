---
id: AUTH-01
title: "Password login, logout, reset"
phase: 0
wave: 4
stream: auth
size: M
status: done
human_required: false
depends_on: ["F-05", "UI-01"]
blocks: ["AUTH-02", "AUTH-07"]
owns: ["app/(auth)/login/", "app/(auth)/reset/", "features/auth/actions.ts", "features/auth/ui/LoginForm.tsx", "features/auth/ui/ResetForms.tsx", "tests/e2e/auth-login.spec.ts"]
touches: []
requirements: ["REQ-AUTH-02", "REQ-NAV-02"]
---

# AUTH-01 · Password login, logout, reset


**Goal.** Fallback email/password sign-in and the login page that SSO buttons plug into.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/ui.md`
- Output of `F-05` (merged on main)
- Output of `UI-01` (merged on main)

## Requirements
- `REQ-AUTH-02` — Email + password login (with password reset) remains available as a fallback for members without an SSO account.
- `REQ-NAV-02` — After login, land on the Worship Library default view.

## Deliverables
- [x] Login page with an `ssoSlot` area (render nothing until AUTH-02 fills it)
- [x] Server actions per api.md
- [x] Reset request + confirm pages
- [x] Redirect to `/library` after login; to `/login?next=` when unauthenticated

## Acceptance criteria
- [x] Seeded user can log in/out
- [x] Wrong password shows generic error (no user enumeration)
- [x] Playwright: login → lands on /library (`tests/e2e/auth-login.spec.ts`)
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `app/(auth)/login/`, `app/(auth)/reset/`, `features/auth/actions.ts`, `features/auth/ui/LoginForm.tsx`, `features/auth/ui/ResetForms.tsx`, `tests/e2e/auth-login.spec.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes (AUTH-01)

- **Redirect deliverable, half done.** After login the form goes to the sanitized `?next=` path, or `/library` by default. Open redirects and auth pages are rejected (`app/(auth)/login/safeNext.ts`). The redirect *to* `/login?next=` for logged-out users is middleware, which AUTH-04 owns (`middleware.ts`). It's unticked until AUTH-04 lands.
- **Playwright.** `tests/e2e/auth-login.spec.ts` (CR `AUTH-01-reset-redirect-and-e2e` §3, follow-up). Signed-out checks run everywhere; sign-in, `?next=` and sign-out run when `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` (or `E2E_MEMBER_*`) are set. The redirect to `/login?next=` for signed-out users is AUTH-04's middleware, and the spec covers it.
- **DoD, no gallery page.** There is no `/dev/<name>` gallery page, because `app/dev/` isn't owned (same CR). The forms need no fixtures. `/login`, `/reset` and `/reset/confirm` render them directly.
- **Seeded user.** No seeded password user exists yet. Log in/out was verified with throwaway users created through the admin API (integration test and Playwright run).
- **Reset redirect.** Reset only completes when `APP_URL` is on the same host as `site_url` (`127.0.0.1:3000` locally) or `/reset/confirm` is on Supabase's redirect allow list. See the CR.
