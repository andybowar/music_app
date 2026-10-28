---
id: PLAY-04
title: "PlayerBar UI"
phase: 3
wave: 4
stream: frontend
size: S
status: todo
human_required: false
depends_on: ["UI-01", "PLAY-01"]
blocks: ["PLAY-05"]
owns: ["features/player/ui/PlayerBar.tsx", "app/dev/player/"]
touches: []
requirements: ["REQ-LIST-05"]
---

# PLAY-04 · PlayerBar UI


**Goal.** Play, Pause, Stop, Skip back/ahead controls.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `UI-01` (merged on main)
- Output of `PLAY-01` (merged on main)

## Requirements
- `REQ-LIST-05` — Playlist: per-song chosen audio item (MP3 or YouTube link); play, pause, stop, skip ahead/back, auto-advance; edit order; rename; delete; share.

## Deliverables
- [ ] Sticky bottom bar: now playing, controls, position

## Acceptance criteria
- [ ] Media Session API metadata set (lock-screen controls)
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/player/ui/PlayerBar.tsx`, `app/dev/player/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
