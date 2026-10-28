---
id: AUTH-04
title: "Session guard + requireUser"
phase: 0
wave: 5
stream: auth
size: S
status: todo
human_required: false
depends_on: ["F-05", "DB-06"]
blocks: ["ADM-01", "LIB-01", "LIB-02", "LIB-03", "LIB-04", "LIB-05", "LIB-06", "LIB-07", "LIST-02", "SRCH-02", "SRCH-10"]
owns: ["lib/auth.ts", "middleware.ts"]
touches: []
requirements: ["REQ-AUTH-06"]
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

## Requirements
- `REQ-AUTH-06` — Disabled users (`users.disabled_at` set) cannot sign in or use existing sessions.

## Deliverables
- [ ] `getUser`, `requireUser`, `requireRole`
- [ ] middleware refreshes Supabase session; redirects unauthenticated requests for `(app)` routes
- [ ] Disabled users are signed out on next request

## Acceptance criteria
- [ ] Unit tests with mocked Supabase
- [ ] Hitting /library logged out → /login?next=/library
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `lib/auth.ts`, `middleware.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
