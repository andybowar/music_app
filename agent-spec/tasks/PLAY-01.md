---
id: PLAY-01
title: "Player engine (pure reducer)"
phase: 3
wave: 3
stream: frontend
size: S
status: in_progress
human_required: false
depends_on: ["F-03"]
blocks: ["PLAY-02", "PLAY-03", "PLAY-04"]
owns: ["features/player/engine.ts"]
touches: []
requirements: ["REQ-LIST-05"]
---

# PLAY-01 · Player engine (pure reducer)


**Goal.** Deterministic playback state machine.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md#pure-modules`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `F-03` (merged on main)

## Requirements
- `REQ-LIST-05` — Playlist: per-song chosen audio item (MP3 or YouTube link); play, pause, stop, skip ahead/back, auto-advance; edit order; rename; delete; share.

## Deliverables
- [ ] playerReducer + tests for every event in every status

## Acceptance criteria
- [ ] TRACK_ERROR skips; NEXT at end → ended; PREV at start restarts
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/player/engine.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
