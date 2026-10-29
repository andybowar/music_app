---
id: PLAY-06
title: "AudioPicker"
phase: 3
wave: 4
stream: frontend
size: S
status: in_progress
human_required: false
depends_on: ["UI-01", "F-03"]
blocks: ["PLAY-05"]
owns: ["features/player/ui/AudioPicker.tsx"]
touches: []
requirements: ["REQ-LIST-05"]
---

# PLAY-06 · AudioPicker


**Goal.** Choose which recording a playlist entry plays.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `UI-01` (merged on main)
- Output of `F-03` (merged on main)

## Requirements
- `REQ-LIST-05` — Playlist: per-song chosen audio item (MP3 or YouTube link); play, pause, stop, skip ahead/back, auto-advance; edit order; rename; delete; share.

## Deliverables
- [ ] Select of audio/video resources labelled like "Nova recording 3/15/24", "YouTube: Hillsong 7/5/22"

## Acceptance criteria
- [ ] Disabled with hint when song has no audio
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/player/ui/AudioPicker.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
