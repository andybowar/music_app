---
id: SRCH-09
title: "Library page (integration)"
phase: 2
wave: 9
stream: frontend
size: M
status: todo
human_required: false
depends_on: ["SRCH-02", "SRCH-05", "SRCH-06", "SRCH-07", "SRCH-08", "SRCH-10", "UI-06", "UI-07", "UI-08", "UI-02", "LIB-06"]
blocks: ["LIST-09", "H-04", "DOC-01", "H-05"]
owns: ["app/(app)/library/", "features/search/ui/LibraryView.tsx", "features/search/ui/RowPanels.tsx"]
touches: []
requirements: ["REQ-NAV-02", "REQ-SRCH-01", "REQ-ROW-02"]
---

# SRCH-09 · Library page (integration)


**Goal.** The Worship Library screen.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `SRCH-02` (merged on main)
- Output of `SRCH-05` (merged on main)
- Output of `SRCH-06` (merged on main)
- Output of `SRCH-07` (merged on main)
- Output of `SRCH-08` (merged on main)
- Output of `SRCH-10` (merged on main)
- Output of `UI-06` (merged on main)
- Output of `UI-07` (merged on main)
- Output of `UI-08` (merged on main)
- Output of `UI-02` (merged on main)
- Output of `LIB-06` (merged on main)

## Requirements
- `REQ-NAV-02` — After login, land on the Worship Library default view.
- `REQ-SRCH-01` — Default view: all songs ordered by `created_at desc, title asc`.
- `REQ-ROW-02` — Each region is a tap target: key → all keys with first chords; title → chorus first line + verse 1 first line; composer → all composers; Resources → lyrics, sheet music, audio, projection files; branch code → branch usage; ADD → add-to-list menu.

## Deliverables
- [ ] RSC page reads params → searchSongs + getFacetOptions
- [ ] Row taps open panels; SongDetail fetched lazily and cached per song
- [ ] `rowAddSlot` render-prop left empty for LIST-09

## Acceptance criteria
- [ ] Playwright: search theme "redemption" → open Resources → open chord chart PDF
- [ ] Back button restores previous search
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `app/(app)/library/`, `features/search/ui/LibraryView.tsx`, `features/search/ui/RowPanels.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
