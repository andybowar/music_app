---
id: LIB-13
title: "Song form: Themes section"
phase: 1
wave: 5
stream: frontend
size: S
status: in_progress
human_required: false
depends_on: ["LIB-10"]
blocks: ["LIB-17"]
owns: ["features/songs/ui/form/ThemesSection.tsx", "app/dev/form-themes/"]
touches: []
requirements: ["REQ-LIB-07"]
---

# LIB-13 · Song form: Themes section


**Goal.** Tag themes per lyric section.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `LIB-10` (merged on main)

## Requirements
- `REQ-LIB-07` — Lyric themes are tagged per section from a shared, normalized theme vocabulary; new themes can be created inline.

## Deliverables
- [ ] For each non-empty section, a chip input with autocomplete (searchThemes prop) and create-new (createTheme prop)

## Acceptance criteria
- [ ] Same theme can be on multiple sections; not twice on one
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/songs/ui/form/ThemesSection.tsx`, `app/dev/form-themes/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
