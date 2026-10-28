---
id: SRCH-11
title: "Search performance test"
phase: 2
wave: 9
stream: backend
size: S
status: todo
human_required: false
depends_on: ["SRCH-03"]
blocks: []
owns: ["tests/perf/search.perf.ts", "tests/perf/synthetic-seed.ts"]
touches: []
requirements: ["REQ-SRCH-07"]
---

# SRCH-11 · Search performance test


**Goal.** Prove search is fast at 5,000 songs.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `SRCH-03` (merged on main)

## Requirements
- `REQ-SRCH-07` — p95 search latency < 300 ms server-side at 5,000 songs.

## Deliverables
- [ ] Synthetic seed generator; benchmark of 20 representative queries

## Acceptance criteria
- [ ] p95 < 300 ms on local stack; report committed in PR description
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `tests/perf/search.perf.ts`, `tests/perf/synthetic-seed.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
