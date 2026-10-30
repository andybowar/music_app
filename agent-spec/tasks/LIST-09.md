---
id: LIST-09
title: "Wire list creation + Add-to-List into app"
phase: 3
wave: 10
stream: frontend
size: M
status: todo
human_required: false
depends_on: ["LIST-04", "LIST-05", "LIST-06", "LIST-01", "LIST-02", "SRCH-09", "UI-02"]
blocks: ["H-04", "SHR-04", "DOC-01", "H-05"]
owns: ["features/lists/ui/AddToListAction.tsx", "features/lists/ui/NavListActions.tsx"]
touches: ["app/(app)/layout.tsx", "features/search/ui/LibraryView.tsx"]
requirements: ["REQ-LIST-01", "REQ-LIST-02", "REQ-NAV-01"]
---

# LIST-09 · Wire list creation + Add-to-List into app


**Goal.** Create Event Setlist / Listening Playlist from nav; ADD on every row.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `LIST-04` (merged on main)
- Output of `LIST-05` (merged on main)
- Output of `LIST-06` (merged on main)
- Output of `LIST-01` (merged on main)
- Output of `LIST-02` (merged on main)
- Output of `SRCH-09` (merged on main)
- Output of `UI-02` (merged on main)

## Requirements
- `REQ-LIST-01` — Create setlist or playlist: enter event date + name. It becomes the session's *current list*.
- `REQ-LIST-02` — Add to list from any song row: Current (if one is set) / Existing (dropdown) / New (date + name). After adding, return to search results with params intact.
- `REQ-NAV-01` — Omnipresent navigation: Search Library, Create Event Setlist, Create Listening Playlist, Open Setlist, Open Playlist, Home, Share.

## Deliverables
- [ ] Layout wraps app in CurrentListProvider and passes real handlers to NavBar
- [ ] Create → dialog → set current → `/library`
- [ ] LibraryView rowAddSlot renders AddToListAction; after add, stays on results with params
- [ ] AddToListAction passes `songTitle` and an `onUndo` that calls `removeListItem` on the added item (CR LIST-06-undo-and-label)

## Acceptance criteria
- [ ] Playwright: Create Event Setlist → search → add 3 songs → open setlist shows 3 in order
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/lists/ui/AddToListAction.tsx`, `features/lists/ui/NavListActions.tsx`
- **May touch** (minimal integration edits only, described in PR): `app/(app)/layout.tsx`, `features/search/ui/LibraryView.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
