---
id: LIB-21
title: "Song page and Edit links from row panels"
phase: 1
wave: 11
stream: frontend
size: S
status: done
human_required: false
depends_on: ["SRCH-09", "BR-02", "LIB-17", "LIB-18"]
blocks: []
owns: []
touches: ["features/search/ui/RowPanels.tsx", "features/search/ui/LibraryView.tsx", "features/branches/ui/BranchesView.tsx", "app/(app)/library/page.tsx", "app/(app)/library/page.test.tsx", "app/(app)/library/RowPanels.test.tsx", "app/(app)/branches/page.tsx"]
requirements: ["REQ-LIB-01"]
---

# LIB-21 · Song page and Edit links from row panels


**Goal.** From a song row in the library (or on the branches page) a user can reach the song page, and contributors and up can reach the edit form. Before this, rows only opened detail panels and nothing linked to `/songs/[id]` or `/songs/[id]/edit` from there. Raised by the project owner 2026-11-03.

## Deliverables
- [x] `SongPanelLinks` under every row panel (`RowPanelBody`): "Open song page" always, "Edit song" when `canEdit`
- [x] `LibraryView` and `BranchesView` optional `canEditSongs`; both pages pass `can(user, 'song:write')`

## Acceptance criteria
- [x] Every panel kind shows the links, including while the song is loading; "Edit song" only with `song:write` (unit tests)
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): none
- **Touches** (small integration edits only; describe each in the PR): `features/search/ui/RowPanels.tsx`, `features/search/ui/LibraryView.tsx`, `features/branches/ui/BranchesView.tsx`, `app/(app)/library/page.tsx`, `app/(app)/library/page.test.tsx`, `app/(app)/library/RowPanels.test.tsx`, `app/(app)/branches/page.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
