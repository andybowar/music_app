---
id: LIST-08
title: "Open Setlist / Open Playlist index"
phase: 3
wave: 8
stream: frontend
size: S
status: todo
human_required: false
depends_on: ["LIST-01", "UI-02"]
blocks: []
owns: ["app/(app)/lists/page.tsx", "features/lists/ui/ListIndex.tsx"]
touches: []
requirements: ["REQ-LIST-07"]
---

# LIST-08 · Open Setlist / Open Playlist index


**Goal.** Find saved lists.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `LIST-01` (merged on main)
- Output of `UI-02` (merged on main)

## Requirements
- `REQ-LIST-07` — Open Setlist / Open Playlist show the user's lists and their branch's lists; upcoming events first.

## Deliverables
- [ ] Tabs Mine / My branch / All branches (setlists only); upcoming first; "Set as current" action

## Acceptance criteria
- [ ] Empty state with create button
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `app/(app)/lists/page.tsx`, `features/lists/ui/ListIndex.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
