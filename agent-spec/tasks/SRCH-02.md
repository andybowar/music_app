---
id: SRCH-02
title: "searchSongs action + default view"
phase: 2
wave: 8
stream: backend
size: S
status: todo
human_required: false
depends_on: ["SRCH-01", "LIB-01", "AUTH-04"]
blocks: ["BR-01", "BR-04", "H-02", "SRCH-03", "SRCH-09"]
owns: ["features/search/server/search.ts"]
touches: ["features/search/server/query.ts"]
requirements: ["REQ-SRCH-01"]
---

# SRCH-02 · searchSongs action + default view


**Goal.** Public entry point returning SearchResult.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `SRCH-01` (merged on main)
- Output of `LIB-01` (merged on main)
- Output of `AUTH-04` (merged on main)

## Requirements
- `REQ-SRCH-01` — Default view: all songs ordered by `created_at desc, title asc`.

## Deliverables
- [ ] searchSongs per contract, mapping rows → SongSummary via assemble.ts

## Acceptance criteria
- [ ] No params → newest first then title
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/search/server/search.ts`
- **May touch** (minimal integration edits only, described in PR): `features/search/server/query.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
