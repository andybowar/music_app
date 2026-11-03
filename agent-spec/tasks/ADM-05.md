---
id: ADM-05
title: "Admin dashboard in the account menu"
phase: 4
wave: 10
stream: frontend
size: S
status: done
human_required: false
depends_on: ["ADM-01", "ADM-02", "H-02", "UI-02"]
blocks: ["ADM-06"]
owns: ["app/(app)/admin/page.tsx", "app/(app)/admin/page.test.tsx", "app/(app)/admin/loading.tsx", "app/(app)/admin/error.tsx", "features/admin/adminAreas.ts", "features/admin/adminAreas.test.ts"]
touches: ["components/NavBar.tsx", "components/NavBar.test.tsx", "app/(app)/layout.tsx"]
requirements: []
---

# ADM-05 · Admin dashboard in the account menu


**Goal.** Admins reach their tools from the account (profile) menu instead of typing URLs. Owner TODO #9, scheduled 2026-11-03.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/contracts/permissions.md` (`admin:users`, `admin:branches`, `theme:merge`, `theme:synonyms`)
- `app/(app)/admin/{users,branches,themes}/page.tsx` (each page's own permission check)

## Deliverables
- [x] `features/admin/adminAreas.ts`: `adminAreasFor(user)` / `canSeeAdmin(user)`, using the same checks as each admin page
- [x] `/admin`: one card per area the user may open (Users with a "N pending" badge for access requests, Branches, Themes); 403 for everyone else; loading and error states
- [x] `UserMenu` optional `adminHref` prop: an "Admin" item above Sign out; the `(app)` layout passes `/admin` when `canSeeAdmin(user)`

## Acceptance criteria
- [x] Admins see all three cards; music leaders see only Themes (they already have that page); members and contributors see no menu item and get 403 on `/admin` (unit tests)
- [x] A failed pending count still renders the dashboard
- [x] Definition of Done in `AGENTS.md` §5 is satisfied (no gallery page: the dashboard is a server page of links, covered by `page.test.tsx`; the menu item is in `/dev/navbar`'s UserMenu once that gallery passes `adminHref`)

## Boundaries
- **Owns** (create/modify freely): `app/(app)/admin/page.tsx`, `app/(app)/admin/page.test.tsx`, `app/(app)/admin/loading.tsx`, `app/(app)/admin/error.tsx`, `features/admin/adminAreas.ts`, `features/admin/adminAreas.test.ts`
- **Touches** (small integration edits only; describe each in the PR): `components/NavBar.tsx`, `components/NavBar.test.tsx`, `app/(app)/layout.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
