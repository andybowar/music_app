---
id: PLAY-05
title: "PlaylistView"
phase: 3
wave: 10
stream: frontend
size: M
status: todo
human_required: false
depends_on: ["PLAY-02", "PLAY-03", "PLAY-04", "PLAY-06", "LIST-07"]
blocks: ["H-04", "SHR-04", "H-05"]
owns: ["features/player/ui/PlaylistView.tsx", "features/player/ui/usePlayer.ts"]
touches: ["app/(app)/lists/[id]/page.tsx"]
requirements: ["REQ-LIST-05"]
---

# PLAY-05 · PlaylistView


**Goal.** Playable listening playlist.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `PLAY-02` (merged on main)
- Output of `PLAY-03` (merged on main)
- Output of `PLAY-04` (merged on main)
- Output of `PLAY-06` (merged on main)
- Output of `LIST-07` (merged on main)

## Requirements
- `REQ-LIST-05` — Playlist: per-song chosen audio item (MP3 or YouTube link); play, pause, stop, skip ahead/back, auto-advance; edit order; rename; delete; share.

## Deliverables
- [ ] Rows with AudioPicker; reorder/remove reuse list item actions; usePlayer wires reducer to adapters
- [ ] Songs without audio shown but skipped

## Acceptance criteria
- [ ] Playwright (mp3 fixture): play → auto-advances to next track
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/player/ui/PlaylistView.tsx`, `features/player/ui/usePlayer.ts`
- **May touch** (minimal integration edits only, described in PR): `app/(app)/lists/[id]/page.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
