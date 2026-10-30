---
id: LIST-06
title: "AddToListMenu"
phase: 3
wave: 5
stream: frontend
size: S
status: in_progress
human_required: false
depends_on: ["UI-01", "LIST-05"]
blocks: ["LIST-09"]
owns: ["features/lists/ui/AddToListMenu.tsx", "app/dev/add-to-list/"]
touches: []
requirements: ["REQ-LIST-02"]
---

# LIST-06 · AddToListMenu


**Goal.** The ADD button menu: Current / Existing / New.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `UI-01` (merged on main)
- Output of `LIST-05` (merged on main)

## Requirements
- `REQ-LIST-02` — Add to list from any song row: Current (if one is set) / Existing (dropdown) / New (date + name). After adding, return to search results with params intact.

## Deliverables
- [ ] Menu per Diagram III ("Event: BG 4/19/26", "Listen: Background1", "New")
- [ ] Toast "Added to …" with undo

## Acceptance criteria
- [ ] Current option only when a current list exists
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/lists/ui/AddToListMenu.tsx`, `app/dev/add-to-list/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
