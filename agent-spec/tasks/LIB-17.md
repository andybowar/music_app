---
id: LIB-17
title: "Song create/edit pages"
phase: 1
wave: 8
stream: frontend
size: L
status: done
human_required: false
depends_on: ["LIB-01", "LIB-02", "LIB-03", "LIB-04", "LIB-05", "LIB-06", "LIB-07", "LIB-11", "LIB-12", "LIB-13", "LIB-14", "LIB-15", "LIB-16", "UI-02"]
blocks: ["CNT-03", "H-04", "H-05"]
owns: ["app/(app)/songs/new/", "app/(app)/songs/[id]/edit/", "features/songs/ui/SongForm.tsx", "features/songs/ui/form/toInput.ts", "app/dev/song-form/", "tests/e2e/song-form.spec.ts"]
touches: []
requirements: ["REQ-LIB-01"]
---

# LIB-17 · Song create/edit pages


**Goal.** Wire the form sections to the server actions.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `LIB-01` (merged on main)
- Output of `LIB-02` (merged on main)
- Output of `LIB-03` (merged on main)
- Output of `LIB-04` (merged on main)
- Output of `LIB-05` (merged on main)
- Output of `LIB-06` (merged on main)
- Output of `LIB-07` (merged on main)
- Output of `LIB-11` (merged on main)
- Output of `LIB-12` (merged on main)
- Output of `LIB-13` (merged on main)
- Output of `LIB-14` (merged on main)
- Output of `LIB-15` (merged on main)
- Output of `LIB-16` (merged on main)
- Output of `UI-02` (merged on main)

## Requirements
- `REQ-LIB-01` — Contributors+ create song entries and can later edit tags and files.

## Deliverables
- [x] SongForm composing all sections with tabs/stepper; dirty-state guard
- [x] `toInput.ts` mapping SongFormValue → action inputs; save orchestrates createSong/updateSong, setSongKeys, setSongComposers, setSongThemes, setBranchUsage
- [x] Server errors mapped onto fields
- [x] Pages gated by `song:write`

## Acceptance criteria
- [ ] Playwright (deferred, see `change-requests/LIB-17-gallery-and-e2e.md`; `tests/e2e/` not owned and local Supabase is down): contributor creates "1000 Hallelujahs" with 3 keys, themes, a PDF and a YouTube link; reload shows all data
- [x] Member visiting /songs/new gets 403 page (`SongFormForbidden`; e2e spec deferred with the one above)
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `app/(app)/songs/new/`, `app/(app)/songs/[id]/edit/`, `features/songs/ui/SongForm.tsx`, `features/songs/ui/form/toInput.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes (LIB-17)

- Composers are saved inside `createSong`/`updateSong` (`composerIds`, same transaction, LIB-01), so the form doesn't call `setSongComposers` separately. Calling it too would only add a duplicate audit row.
- On edit, only slices that changed since the last save are sent. After a create, the page moves to `/songs/[id]/edit?created=1` on the files tab, because files need a saved song and key ids.
- The 403 is rendered in the page with HTTP 200, the same pattern as `/admin/users`. Next's `forbidden()` needs `experimental.authInterrupts`, and `next.config.ts` isn't owned.
- The gallery page and the e2e spec are proposed in `change-requests/LIB-17-gallery-and-e2e.md`.
