---
id: LIST-04
title: "Current list context"
phase: 3
wave: 3
stream: frontend
size: S
status: todo
human_required: false
depends_on: ["F-03"]
blocks: ["LIST-09"]
owns: ["features/lists/ui/CurrentList.tsx"]
touches: []
requirements: ["REQ-LIST-01", "REQ-NAV-04"]
---

# LIST-04 · Current list context


**Goal.** Remember the list being built this session.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `F-03` (merged on main)

## Requirements
- `REQ-LIST-01` — Create setlist or playlist: enter event date + name. It becomes the session's *current list*.
- `REQ-NAV-04` — Share acts on the *current list*; disabled when there is none.

## Deliverables
- [ ] Provider + hook; cookie `current_list` (list id, 12h); server helper `readCurrentListId()`

## Acceptance criteria
- [ ] Survives reload; cleared if list is deleted
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/lists/ui/CurrentList.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
