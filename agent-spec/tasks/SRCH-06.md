---
id: SRCH-06
title: "FilterBar (concurrent dropdowns)"
phase: 2
wave: 5
stream: frontend
size: M
status: done
human_required: false
depends_on: ["UI-04", "SRCH-04"]
blocks: ["SRCH-09"]
owns: ["features/search/ui/FilterBar.tsx", "app/dev/filter-bar/"]
touches: []
requirements: ["REQ-SRCH-03"]
---

# SRCH-06 · FilterBar (concurrent dropdowns)


**Goal.** All Diagram II filters, combinable.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `UI-04` (merged on main)
- Output of `SRCH-04` (merged on main)

## Requirements
- `REQ-SRCH-03` — Optional concurrent multi-select filters: energy level(s), key(s), decade(s) written, branch use (branch + level), first chord of chorus/refrain, first chord of verse, first chord of bridge.

## Deliverables
- [x] Multi-select dropdowns: Energy (colored), Key, Decade, Branch use (branch then levels), First chord refrain/verse/bridge
- [x] Active filter chips with remove; "Clear filters"
- [x] Options from `FacetOptions` prop

## Acceptance criteria
- [x] Mobile: filters collapse into a sheet
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/search/ui/FilterBar.tsx`, `app/dev/filter-bar/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
