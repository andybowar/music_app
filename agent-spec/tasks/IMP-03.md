---
id: IMP-03
title: "Import runner CLI"
phase: 1
wave: 8
stream: data
size: M
status: done
human_required: false
depends_on: ["IMP-01", "IMP-02", "LIB-01", "LIB-02", "LIB-03", "LIB-04", "LIB-05", "LIB-06", "LIB-07"]
blocks: []
owns: ["scripts/import.ts", "docs/import.md"]
touches: []
requirements: ["REQ-LIB-13"]
---

# IMP-03 · Import runner CLI


**Goal.** `pnpm import --csv songs.csv --files ./folder [--dry-run]`.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/schema.md`
- `agent-spec/contracts/types.md`
- Output of `IMP-01` (merged on main)
- Output of `IMP-02` (merged on main)
- Output of `LIB-01` (merged on main)
- Output of `LIB-02` (merged on main)
- Output of `LIB-03` (merged on main)
- Output of `LIB-04` (merged on main)
- Output of `LIB-05` (merged on main)
- Output of `LIB-06` (merged on main)
- Output of `LIB-07` (merged on main)

## Requirements
- `REQ-LIB-13` — Bulk import from CSV + a folder of files, with dry-run report and idempotent re-run.

## Deliverables
- [x] Dry-run report (created/updated/skipped/errors, unmatched files) as markdown
- [x] Idempotent upsert by lower(title)+year; uploads files
- [x] Runs as service role with an `--actor` admin email for audit

## Acceptance criteria
- [x] Running twice creates no duplicates
- [x] docs/import.md explains the workflow for music leaders
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `scripts/import.ts`, `docs/import.md`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
