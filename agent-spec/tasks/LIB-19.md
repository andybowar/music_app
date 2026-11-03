---
id: LIB-19
title: "Song change history"
phase: 1
wave: 9
stream: frontend
size: S
status: done
human_required: false
depends_on: ["LIB-18", "DB-06"]
blocks: []
owns: ["features/audit/", "app/dev/song-history/"]
touches: ["features/songs/ui/SongPage.tsx", "features/songs/ui/SongPage.test.tsx", "features/songs/server/keys.ts"]
requirements: ["REQ-LIB-12"]
---

# LIB-19 · Song change history


**Goal.** Show who changed what.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `LIB-18` (merged on main)
- Output of `DB-06` (merged on main)

## Requirements
- `REQ-LIB-12` — Edits are recorded in an audit log (who, when, what changed) viewable on the song.

## Deliverables
- [x] `getAuditTrail` read helper
- [x] History tab: timeline of entries with field diffs

## Acceptance criteria
- [x] Visible to contributor+; hidden for members
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/audit/`, `app/dev/song-history/`
- **May touch** (minimal integration edits only, described in PR): `features/songs/ui/SongPage.tsx`, `features/songs/ui/SongPage.test.tsx`, `features/songs/server/keys.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
