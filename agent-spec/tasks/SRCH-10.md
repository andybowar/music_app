---
id: SRCH-10
title: "Facet options"
phase: 2
wave: 7
stream: backend
size: S
status: todo
human_required: false
depends_on: ["DB-06", "AUTH-04"]
blocks: ["SRCH-09"]
owns: ["features/search/server/facets.ts"]
touches: []
requirements: ["REQ-SRCH-03"]
---

# SRCH-10 · Facet options


**Goal.** Populate filter dropdowns from real data.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `DB-06` (merged on main)
- Output of `AUTH-04` (merged on main)

## Requirements
- `REQ-SRCH-03` — Optional concurrent multi-select filters: energy level(s), key(s), decade(s) written, branch use (branch + level), first chord of chorus/refrain, first chord of verse, first chord of bridge.

## Deliverables
- [ ] `getFacetOptions` (distinct keys, decades, primary-key first chords, branches); cached 5 min

## Acceptance criteria
- [ ] Test against seed
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/search/server/facets.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
