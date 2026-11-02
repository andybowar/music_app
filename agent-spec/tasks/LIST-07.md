---
id: LIST-07
title: "Setlist view + route"
phase: 3
wave: 9
stream: frontend
size: L
status: done
human_required: false
depends_on: ["LIST-01", "LIST-02", "UI-05", "UI-02", "UI-06"]
blocks: ["H-01", "PLAY-05", "SHR-04"]
owns: ["app/(app)/lists/[id]/", "features/lists/ui/SetlistView.tsx", "features/lists/ui/ItemOverrideEditor.tsx"]
touches: []
requirements: ["REQ-LIST-03", "REQ-LIST-04", "REQ-LIST-06"]
---

# LIST-07 · Setlist view + route


**Goal.** View and edit a setlist.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `LIST-01` (merged on main)
- Output of `LIST-02` (merged on main)
- Output of `UI-05` (merged on main)
- Output of `UI-02` (merged on main)
- Output of `UI-06` (merged on main)

## Requirements
- `REQ-LIST-03` — Setlist: edit, reorder (drag and drop), rename, delete, share.
- `REQ-LIST-04` — Setlist per-song overrides: key, BPM, energy — independent of library files. If no `song_keys` row exists for the override key, first chords display **"X"** and resources are empty, with a prompt to upload files for that key.
- `REQ-LIST-06` — Lists persist until manually deleted (soft delete).

## Deliverables
- [x] Route dispatches on list.type: SetlistView, or `PlaylistView` from features/player/ui (render placeholder until PLAY-05)
- [x] dnd-kit reorder (keyboard accessible), remove, rename, delete with confirm
- [x] ItemOverrideEditor: key/BPM/energy; shows X chords + "Upload files for {key}" link to song edit when needsUpload
- [x] Read-only mode when !canEdit

## Acceptance criteria
- [ ] Playwright: reorder persists; override to E on a song lacking E shows X and the upload prompt
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `app/(app)/lists/[id]/`, `features/lists/ui/SetlistView.tsx`, `features/lists/ui/ItemOverrideEditor.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes (LIST-07)

- **Playwright, not committed.** `tests/e2e/` isn't owned and local Supabase wasn't available. The two scenarios are covered at component level in `features/lists/ui/SetlistView.test.tsx` (reorder saved via `reorderList`, with rollback; override to E on "Cause to Celebrate" shows X chords and "Upload files for E"). The spec, a `/dev/setlist` gallery and an optional `songs?: SongDetail[]` prop on `SetlistView` are proposed in `change-requests/LIST-07-setlist-extras.md`.
- **Share** (REQ-LIST-03) is wired by SHR-04 (`ShareDialog`), which depends on this task.
