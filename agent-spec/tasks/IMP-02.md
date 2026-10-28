---
id: IMP-02
title: "Import file matcher"
phase: 1
wave: 4
stream: data
size: S
status: todo
human_required: false
depends_on: ["F-03", "IMP-01"]
blocks: ["IMP-03"]
owns: ["features/import/match.ts"]
touches: []
requirements: ["REQ-LIB-13"]
---

# IMP-02 · Import file matcher


**Goal.** Map files in a folder to songs/keys/kinds by filename.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/schema.md`
- `agent-spec/contracts/types.md`
- Output of `F-03` (merged on main)
- Output of `IMP-01` (merged on main)

## Requirements
- `REQ-LIB-13` — Bulk import from CSV + a folder of files, with dry-run report and idempotent re-run.

## Deliverables
- [ ] `matchFiles` per naming convention; fuzzy title match (normalized) with confidence

## Acceptance criteria
- [ ] Tests including numbered duplicates ("Chord Chart 2") and projection files
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/import/match.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
