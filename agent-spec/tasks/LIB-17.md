---
id: LIB-17
title: "Song create/edit pages"
phase: 1
wave: 8
stream: frontend
size: L
status: in_progress
human_required: false
depends_on: ["LIB-01", "LIB-02", "LIB-03", "LIB-04", "LIB-05", "LIB-06", "LIB-07", "LIB-11", "LIB-12", "LIB-13", "LIB-14", "LIB-15", "LIB-16", "UI-02"]
blocks: ["CNT-03", "H-04", "H-05"]
owns: ["app/(app)/songs/new/", "app/(app)/songs/[id]/edit/", "features/songs/ui/SongForm.tsx", "features/songs/ui/form/toInput.ts"]
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
- [ ] SongForm composing all sections with tabs/stepper; dirty-state guard
- [ ] `toInput.ts` mapping SongFormValue → action inputs; save orchestrates createSong/updateSong, setSongKeys, setSongComposers, setSongThemes, setBranchUsage
- [ ] Server errors mapped onto fields
- [ ] Pages gated by `song:write`

## Acceptance criteria
- [ ] Playwright: contributor creates "1000 Hallelujahs" with 3 keys, themes, a PDF and a YouTube link; reload shows all data
- [ ] Member visiting /songs/new gets 403 page
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `app/(app)/songs/new/`, `app/(app)/songs/[id]/edit/`, `features/songs/ui/SongForm.tsx`, `features/songs/ui/form/toInput.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
