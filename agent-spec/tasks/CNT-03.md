---
id: CNT-03
title: "Pilot data entry: first 50 songs"
phase: 1
wave: 8
stream: content
size: L
status: todo
human_required: true
depends_on: ["LIB-17", "CNT-02"]
blocks: ["PILOT-01"]
owns: []
touches: []
requirements: []
---

# CNT-03 · Pilot data entry: first 50 songs

> **Human required.** Agents: skip this task; it needs credentials or a person’s judgment.

**Goal.** Real songs in staging to validate the model.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- Output of `LIB-17` (merged on main)
- Output of `CNT-02` (merged on main)

## Deliverables
- [ ] 50 songs entered or imported with files and tags
- [ ] List of friction points filed as new tasks

## Acceptance criteria
- [ ] Phase 1 exit criterion met
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- Owns no repository files.
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
