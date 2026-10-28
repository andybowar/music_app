---
id: AUTH-01
title: "Password login, logout, reset"
phase: 0
wave: 4
stream: auth
size: M
status: todo
human_required: false
depends_on: ["F-05", "UI-01"]
blocks: ["AUTH-02"]
owns: ["app/(auth)/login/", "app/(auth)/reset/", "features/auth/actions.ts", "features/auth/ui/LoginForm.tsx", "features/auth/ui/ResetForms.tsx"]
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
- [ ] Login page with an `ssoSlot` area (render nothing until AUTH-02 fills it)
- [ ] Server actions per api.md
- [ ] Reset request + confirm pages
- [ ] Redirect to `/library` after login; to `/login?next=` when unauthenticated

## Acceptance criteria
- [ ] Seeded user can log in/out
- [ ] Wrong password shows generic error (no user enumeration)
- [ ] Playwright: login → lands on /library
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `app/(auth)/login/`, `app/(auth)/reset/`, `features/auth/actions.ts`, `features/auth/ui/LoginForm.tsx`, `features/auth/ui/ResetForms.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
