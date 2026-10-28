---
id: OPS-03
title: "Backups, restore drill, quota alerts"
phase: 5
wave: 2
stream: ops
size: S
status: todo
human_required: true
depends_on: ["OPS-01"]
blocks: ["PILOT-01"]
owns: ["docs/ops/backups.md"]
touches: []
requirements: ["REQ-NF-04"]
---

# OPS-03 · Backups, restore drill, quota alerts

> **Human required.** Agents: skip this task; it needs credentials or a person’s judgment.

**Goal.** Recoverability.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- Output of `OPS-01` (merged on main)

## Requirements
- `REQ-NF-04` — Errors tracked (Sentry); daily DB backups; storage usage alerts.

## Deliverables
- [ ] Confirm daily backups; perform one restore to a scratch project; storage usage alert at 80%

## Acceptance criteria
- [ ] docs/ops/backups.md records the drill
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `docs/ops/backups.md`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
