---
id: SRCH-07
title: "SortControl"
phase: 2
wave: 4
stream: frontend
size: S
status: todo
human_required: false
depends_on: ["UI-01", "SRCH-04"]
blocks: ["SRCH-09"]
owns: ["features/search/ui/SortControl.tsx"]
touches: []
requirements: ["REQ-SRCH-04"]
---

# SRCH-07 · SortControl


**Goal.** Sort selector.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `UI-01` (merged on main)
- Output of `SRCH-04` (merged on main)

## Requirements
- `REQ-SRCH-04` — Sort: alphanumeric, primary key, energy level, date added, branch use.

## Deliverables
- [ ] Select: Date added, A–Z, Primary key, Energy, Branch use; direction toggle; "Relevance" shown when q present and no sort

## Acceptance criteria
- [ ] Keyboard operable
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/search/ui/SortControl.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
