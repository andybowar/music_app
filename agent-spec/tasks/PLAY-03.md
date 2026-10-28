---
id: PLAY-03
title: "YouTube adapter"
phase: 3
wave: 4
stream: frontend
size: S
status: todo
human_required: false
depends_on: ["PLAY-01"]
blocks: ["PLAY-05"]
owns: ["features/player/adapters/youtube.ts"]
touches: []
requirements: []
---

# PLAY-03 · YouTube adapter


**Goal.** PlayerAdapter over YouTube IFrame API.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `PLAY-01` (merged on main)

## Deliverables
- [ ] Lazy script loader (once), hidden/compact player element, state mapping

## Acceptance criteria
- [ ] Tests with mocked YT global
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/player/adapters/youtube.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
