---
id: SRCH-03
title: "Fuzzy title fallback + did-you-mean"
phase: 2
wave: 8
stream: backend
size: S
status: todo
human_required: false
depends_on: ["SRCH-02"]
blocks: ["SRCH-11"]
owns: ["features/search/server/fuzzy.ts"]
touches: ["features/search/server/search.ts"]
requirements: ["REQ-SRCH-06"]
---

# SRCH-03 · Fuzzy title fallback + did-you-mean


**Goal.** Typo tolerance on titles.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `SRCH-02` (merged on main)

## Requirements
- `REQ-SRCH-06` — Typo-tolerant title matching (trigram) when full-text finds few results.

## Deliverables
- [ ] If FTS total < 3 and q present: union trigram matches (similarity > 0.3) on title/alt_titles; set `didYouMean` to best title

## Acceptance criteria
- [ ] "halelujahs" finds "1000 Hallelujahs"
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/search/server/fuzzy.ts`
- **May touch** (minimal integration edits only, described in PR): `features/search/server/search.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
