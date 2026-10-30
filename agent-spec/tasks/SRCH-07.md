---
id: SRCH-07
title: "SortControl"
phase: 2
wave: 4
stream: frontend
size: S
status: done
human_required: false
depends_on: ["UI-01", "SRCH-04"]
blocks: ["SRCH-09"]
owns: ["features/search/ui/SortControl.tsx", "app/dev/sort-control/"]
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
- [x] Select: Date added, A–Z, Primary key, Energy, Branch use; direction toggle; "Relevance" shown when q present and no sort

## Acceptance criteria
- [x] Keyboard operable
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/search/ui/SortControl.tsx`, `app/dev/sort-control/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes

- Definition of Done is left unticked for two reasons. First, there is no `/dev/sort-control` gallery, because this task doesn't own an `app/dev/` path; it's proposed in `agent-spec/change-requests/SRCH-07-sort-control-props-and-gallery.md`. Second, the 360px layout is covered only by a class-level unit test and hasn't been checked in a browser.
- The same CR proposes the optional `hasQuery` prop. "Relevance" needs it, and the frozen contract doesn't carry `q`. It also proposes typing `onChange(sort: Sort | undefined, dir: 'asc'|'desc' | undefined)`.
