---
id: LIST-05
title: "CreateListDialog"
phase: 3
wave: 4
stream: frontend
size: S
status: done
human_required: false
depends_on: ["UI-01", "F-03"]
blocks: ["LIST-06", "LIST-09"]
owns: ["features/lists/ui/CreateListDialog.tsx", "app/dev/create-list/"]
touches: []
requirements: ["REQ-LIST-01"]
---

# LIST-05 · CreateListDialog


**Goal.** Enter date + name.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `UI-01` (merged on main)
- Output of `F-03` (merged on main)

## Requirements
- `REQ-LIST-01` — Create setlist or playlist: enter event date + name. It becomes the session's *current list*.

## Deliverables
- [x] Date picker (required for setlist), name with suggestion e.g. "Lord's Day 4/19/26"

## Acceptance criteria
- [x] Validation errors from ActionResult shown inline
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/lists/ui/CreateListDialog.tsx`, `app/dev/create-list/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
