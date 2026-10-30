---
id: SRCH-01
title: "Search query builder"
phase: 2
wave: 5
stream: backend
size: L
status: in_progress
human_required: false
depends_on: ["DB-02", "DB-04", "DB-06"]
blocks: ["SRCH-02"]
owns: ["features/search/server/query.ts"]
touches: []
requirements: ["REQ-SRCH-01", "REQ-SRCH-02", "REQ-SRCH-03", "REQ-SRCH-04"]
---

# SRCH-01 · Search query builder


**Goal.** One SQL query implementing text + all filters + sorts.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `DB-02` (merged on main)
- Output of `DB-04` (merged on main)
- Output of `DB-06` (merged on main)

## Requirements
- `REQ-SRCH-01` — Default view: all songs ordered by `created_at desc, title asc`.
- `REQ-SRCH-02` — Optional free text, searchable across fields individually toggleable: Titles (incl. alternate), Lyrics (all sections), Themes, Composer.
- `REQ-SRCH-03` — Optional concurrent multi-select filters: energy level(s), key(s), decade(s) written, branch use (branch + level), first chord of chorus/refrain, first chord of verse, first chord of bridge.
- `REQ-SRCH-04` — Sort: alphanumeric, primary key, energy level, date added, branch use.

## Deliverables
- [ ] `buildSearchQuery(params)`: `websearch_to_tsquery` + `ts_filter` by field weights; ts_rank ordering when q and no sort
- [ ] Filters: energy, key (any song_keys row), decade, branch+usage, primary-key first chords
- [ ] Sorts: date, alpha (unaccented, case-insensitive), key (primary, circle-of-fifths order not required — alphabetical), energy (ENERGY_LEVELS order), branch_use (for selected branch, else current user's branch)
- [ ] Pagination + total via window count

## Acceptance criteria
- [ ] Integration tests against seed for each filter alone and combined
- [ ] Search "redemption" with fields=[themes] finds 1000 Hallelujahs; with fields=[title] does not
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/search/server/query.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
