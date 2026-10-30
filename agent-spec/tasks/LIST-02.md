---
id: LIST-02
title: "List items server"
phase: 3
wave: 7
stream: backend
size: M
status: in_progress
human_required: false
depends_on: ["DB-06", "AUTH-04", "AUTH-05"]
blocks: ["LIST-07", "LIST-09"]
owns: ["features/lists/server/items.ts"]
touches: []
requirements: ["REQ-LIST-02", "REQ-LIST-03", "REQ-LIST-04", "REQ-LIST-05"]
---

# LIST-02 · List items server


**Goal.** Add, remove, reorder, override.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `DB-06` (merged on main)
- Output of `AUTH-04` (merged on main)
- Output of `AUTH-05` (merged on main)

## Requirements
- `REQ-LIST-02` — Add to list from any song row: Current (if one is set) / Existing (dropdown) / New (date + name). After adding, return to search results with params intact.
- `REQ-LIST-03` — Setlist: edit, reorder (drag and drop), rename, delete, share.
- `REQ-LIST-04` — Setlist per-song overrides: key, BPM, energy — independent of library files. If no `song_keys` row exists for the override key, first chords display **"X"** and resources are empty, with a prompt to upload files for that key.
- `REQ-LIST-05` — Playlist: per-song chosen audio item (MP3 or YouTube link); play, pause, stop, skip ahead/back, auto-advance; edit order; rename; delete; share.

## Deliverables
- [ ] Functions per contract; positions stay contiguous 0..n-1
- [ ] reorderList validates the id set equals current items
- [ ] updateListItem: resourceId must belong to the song and be audio/video

## Acceptance criteria
- [ ] Concurrency test: two reorders → last write wins, positions still contiguous
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/lists/server/items.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
