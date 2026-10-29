---
id: LIB-10
title: "Song form: Basic info section"
phase: 1
wave: 4
stream: frontend
size: M
status: done
human_required: false
depends_on: ["UI-01", "F-04"]
blocks: ["LIB-11", "LIB-12", "LIB-13", "LIB-14", "LIB-15"]
owns: ["features/songs/ui/form/types.ts", "features/songs/ui/form/BasicInfoSection.tsx", "app/dev/form-basic/"]
touches: []
requirements: ["REQ-LIB-02", "REQ-LIB-03"]
---

# LIB-10 · Song form: Basic info section


**Goal.** Title, alternate titles, composers, source group, year.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `UI-01` (merged on main)
- Output of `F-04` (merged on main)

## Requirements
- `REQ-LIB-02` — Basic info: title, alternate titles (0..n), composers (1..n, ordered), source group, year composed.
- `REQ-LIB-03` — Composers carry a POP-membership flag: `none | past | current`. Past/current are color-highlighted in the UI.

## Deliverables
- [x] `SongFormValue` type file exactly per ui.md
- [x] Alt titles as chips; composers multi-select (command palette) with "create" option via `searchComposers`/`createComposer` passed as props
- [x] Drag to order composers

## Acceptance criteria
- [x] Dev page works with fixture-backed fake search fn
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/songs/ui/form/types.ts`, `features/songs/ui/form/BasicInfoSection.tsx`, `app/dev/form-basic/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
