---
id: LIB-03
title: "Composers actions"
phase: 1
wave: 7
stream: backend
size: S
status: in_progress
human_required: false
depends_on: ["DB-06", "AUTH-04", "AUTH-05"]
blocks: ["IMP-03", "LIB-17"]
owns: ["features/songs/server/composers.ts"]
touches: []
requirements: ["REQ-LIB-02", "REQ-LIB-03"]
---

# LIB-03 · Composers actions


**Goal.** Composer lookup, create, ordering, POP flag, merge.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `DB-06` (merged on main)
- Output of `AUTH-04` (merged on main)
- Output of `AUTH-05` (merged on main)

## Requirements
- `REQ-LIB-02` — Basic info: title, alternate titles (0..n), composers (1..n, ordered), source group, year composed.
- `REQ-LIB-03` — Composers carry a POP-membership flag: `none | past | current`. Past/current are color-highlighted in the UI.

## Deliverables
- [ ] Functions per contract; case-insensitive dedupe on create
- [ ] merge re-points song_composers and deletes the dropped composer

## Acceptance criteria
- [ ] Tests for prefix search, dedupe, ordering, merge
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/songs/server/composers.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
