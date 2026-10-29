---
id: LIB-05
title: "Branch usage action"
phase: 1
wave: 7
stream: backend
size: S
status: todo
human_required: false
depends_on: ["DB-06", "AUTH-04", "AUTH-05"]
blocks: ["IMP-03", "LIB-17", "BR-03"]
owns: ["features/songs/server/usage.ts"]
touches: []
requirements: ["REQ-LIB-05"]
---

# LIB-05 · Branch usage action


**Goal.** Manual per-branch usage levels.

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
- `REQ-LIB-05` — Branch usage per branch: `high | low | rare | none`.

## Deliverables
- [ ] setBranchUsage upserts with source=manual

## Acceptance criteria
- [ ] Tests; member → FORBIDDEN
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/songs/server/usage.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
