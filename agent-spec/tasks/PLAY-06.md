---
id: PLAY-06
title: "AudioPicker"
phase: 3
wave: 4
stream: frontend
size: S
status: done
human_required: false
depends_on: ["UI-01", "F-03"]
blocks: ["PLAY-05"]
owns: ["features/player/ui/AudioPicker.tsx", "features/player/ui/AudioPicker.test.tsx", "app/dev/audio-picker/"]
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
- [x] Select of audio/video resources labelled like "Nova recording 3/15/24", "YouTube: Hillsong 7/5/22"

## Acceptance criteria
- [x] Disabled with hint when song has no audio
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied — all items met except the `/dev/<name>` gallery, pending CR PLAY-06-audio-picker-gallery

## Boundaries
- **Owns** (create/modify freely): `features/player/ui/AudioPicker.tsx`, `features/player/ui/AudioPicker.test.tsx`, `app/dev/audio-picker/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes (PLAY-06)

- Offers only `audio` (MP3/M4A/link) and `video_link` resources. Instruction links and PDFs are left out. Option text comes from `resource.label`; a YouTube URL whose label lacks a "YouTube" prefix gets "YouTube: " added.
- Uses a native `<select>`, so keyboard and mobile pickers work out of the box. Includes a "No recording" option that clears the choice (`onChange(null)`).
- Loading and error states don't apply. The component is fully controlled and does no I/O, so the parent owns those.
- The `/dev/audio-picker` gallery isn't created because PLAY-06 doesn't own that path. See `agent-spec/change-requests/PLAY-06-audio-picker-gallery.md`.
