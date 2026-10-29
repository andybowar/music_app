---
id: PLAY-02
title: "MP3 adapter"
phase: 3
wave: 4
stream: frontend
size: S
status: in_progress
human_required: false
depends_on: ["PLAY-01"]
blocks: ["PLAY-05"]
owns: ["features/player/adapters/mp3.ts"]
touches: []
requirements: []
---

# PLAY-02 · MP3 adapter


**Goal.** PlayerAdapter over HTML5 Audio.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `PLAY-01` (merged on main)

## Deliverables
- [ ] Adapter + tests with a fake HTMLAudioElement

## Acceptance criteria
- [ ] Emits ended/error correctly
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/player/adapters/mp3.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
