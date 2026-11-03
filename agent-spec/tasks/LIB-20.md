---
id: LIB-20
title: "Add song entry points (library + nav)"
phase: 1
wave: 11
stream: frontend
size: S
status: done
human_required: false
depends_on: ["LIB-17", "SRCH-09", "LIST-09", "UI-02"]
blocks: []
owns: []
touches: ["components/NavBar.tsx", "components/NavBar.test.tsx", "features/lists/ui/NavListActions.tsx", "features/lists/ui/NavListActions.test.tsx", "features/search/ui/LibraryView.tsx", "app/(app)/library/page.tsx", "app/(app)/library/page.test.tsx", "app/(app)/library/LibraryView.test.tsx", "app/(app)/layout.tsx"]
requirements: ["REQ-LIB-01"]
---

# LIB-20 · Add song entry points (library + nav)


**Goal.** Contributors, music leaders and admins can reach the new-song form (`/songs/new`, LIB-17) from the app. Before this, nothing linked to it.

Decided by the project owner 2026-11-03: an "Add song" button in the Worship Library and an "Add song" item in the nav's More menu, shown only to users with `song:write`.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/contracts/ui.md` (`NavBar`), `agent-spec/contracts/permissions.md` (`song:write`)

## Deliverables
- [x] `NavBar` optional `canAddSong` prop: "Add song" (→ `/songs/new`) at the top of the More menu, desktop and mobile; `NAV_HREFS.addSong`
- [x] `NavListActions` passes `canAddSong` through; the `(app)` layout sets it from `can(user, 'song:write')`
- [x] `LibraryView` optional `canAddSong` prop: an "Add song" link button beside the sort control; the library page sets it from `can(user, 'song:write')`

## Acceptance criteria
- [x] Members see neither link; contributors and up see both (unit tests)
- [x] `/songs/new` still checks `song:write` itself (unchanged)
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): none
- **Touches** (small integration edits only; describe each in the PR): `components/NavBar.tsx`, `components/NavBar.test.tsx`, `features/lists/ui/NavListActions.tsx`, `features/lists/ui/NavListActions.test.tsx`, `features/search/ui/LibraryView.tsx`, `app/(app)/library/page.tsx`, `app/(app)/library/page.test.tsx`, `app/(app)/library/LibraryView.test.tsx`, `app/(app)/layout.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
