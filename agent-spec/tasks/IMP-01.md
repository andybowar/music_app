---
id: IMP-01
title: "Import CSV parser"
phase: 1
wave: 3
stream: data
size: M
status: in_progress
human_required: false
depends_on: ["F-03"]
blocks: ["IMP-02", "IMP-03"]
owns: ["features/import/parse.ts", "features/import/types.ts", "docs/import-template.csv"]
touches: []
requirements: ["REQ-LIB-13"]
---

# IMP-01 · Import CSV parser


**Goal.** Turn the import CSV into validated song inputs.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md#import-format-imp-01`
- `agent-spec/contracts/schema.md`
- `agent-spec/contracts/types.md`
- Output of `F-03` (merged on main)

## Requirements
- `REQ-LIB-13` — Bulk import from CSV + a folder of files, with dry-run report and idempotent re-run.

## Deliverables
- [ ] `parseImportCsv`, `ImportRow` type
- [ ] Template CSV with 2 example rows
- [ ] Per-line errors, never throws

## Acceptance criteria
- [ ] Tests: POP composer markers, multi-value cells, unknown branch column, bad key
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/import/parse.ts`, `features/import/types.ts`, `docs/import-template.csv`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
