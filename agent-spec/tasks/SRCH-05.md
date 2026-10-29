---
id: SRCH-05
title: "SearchBar with field toggles"
phase: 2
wave: 4
stream: frontend
size: S
status: in_progress
human_required: false
depends_on: ["UI-01", "SRCH-04"]
blocks: ["SRCH-09"]
owns: ["features/search/ui/SearchBar.tsx", "app/dev/search-bar/"]
touches: []
requirements: ["REQ-SRCH-02"]
---

# SRCH-05 · SearchBar with field toggles


**Goal.** Free text + Titles/Lyrics/Themes/Composer toggles.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `UI-01` (merged on main)
- Output of `SRCH-04` (merged on main)

## Requirements
- `REQ-SRCH-02` — Optional free text, searchable across fields individually toggleable: Titles (incl. alternate), Lyrics (all sections), Themes, Composer.

## Deliverables
- [ ] Input, toggle-group (all on by default; at least one must stay on), clear button

## Acceptance criteria
- [ ] Enter submits; Esc clears
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/search/ui/SearchBar.tsx`, `app/dev/search-bar/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
