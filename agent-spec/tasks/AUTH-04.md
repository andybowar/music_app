---
id: AUTH-04
title: "Session guard + requireUser"
phase: 0
wave: 6
stream: auth
size: S
status: done
human_required: false
depends_on: ["F-05", "DB-06", "DB-07"]
blocks: ["ADM-01", "LIB-01", "LIB-02", "LIB-03", "LIB-04", "LIB-05", "LIB-06", "LIB-07", "LIST-02", "SRCH-10", "SRCH-02"]
owns: ["lib/auth.ts", "middleware.ts"]
touches: ["app/(app)/layout.tsx", "lib/permissions.ts"]
requirements: ["REQ-AUTH-06", "REQ-AUTH-08"]
---

# AUTH-04 · Session guard + requireUser


**Goal.** Every protected route and action knows the current AppUser.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md#core-libs`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/ui.md`
- Output of `F-05` (merged on main)
- Output of `DB-06` (merged on main)
- Output of `DB-07` (merged on main): `users.access_status`, `AppUser.accessStatus`
- `agent-spec/change-requests/OWNER-access-approval.md`

## Requirements
- `REQ-AUTH-06` — Disabled users (`users.disabled_at` set) cannot sign in or use existing sessions.
- `REQ-AUTH-08` — Pending and rejected users who sign in see only an account-status page.

## Deliverables
- [x] `getUser`, `requireUser`, `requireRole` (plus `requirePageUser` / `requirePageRole` for server components)
- [x] middleware refreshes Supabase session; redirects unauthenticated requests for `(app)` routes
- [x] Disabled users are signed out on next request
- [x] `getUser` returns the user whatever their access status; `requireUser` returns only approved users and throws FORBIDDEN for pending/rejected (contract: `api.md` core libs)
- [x] Middleware sends signed-in pending/rejected users who request any `(app)` route to `/account-status`; `(auth)` routes (`/login`, `/signup`, `/reset`, `/account-status`, `/auth/callback`) stay reachable. The `/account-status` page itself is delivered by AUTH-07; until it merges the redirect lands on a 404.

## Acceptance criteria
- [x] Unit tests with mocked Supabase
- [x] Hitting /library logged out → /login?next=/library
- [x] Hitting /library as a pending or rejected user → /account-status (route from AUTH-07); as an approved user → /library
- [x] A server action called by a pending user returns FORBIDDEN
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `lib/auth.ts`, `middleware.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
