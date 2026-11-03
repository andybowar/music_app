---
id: LIST-10
title: "Label first chords clearly"
phase: 3
wave: 10
stream: frontend
size: S
status: done
human_required: false
depends_on: ["LIST-07", "UI-06"]
blocks: []
owns: []
touches: ["features/lists/ui/ItemOverrideEditor.tsx", "features/lists/ui/ItemOverrideEditor.test.tsx", "components/song/panels/KeyPanel.tsx", "components/song/panels/KeyPanel.test.tsx"]
requirements: ["REQ-LIB-08", "REQ-LIST-04", "REQ-ROW-02"]
---

# LIST-10 · Label first chords clearly


**Goal.** The Intro / Verse / Chorus / Bridge values are each section's first chord (REQ-LIB-08), not a key per section. Rows and the key panel read as keys today; label them "First chords" so they're clear and easy to spot. Raised by the project owner 2026-11-03.

## Deliverables
- [x] `FirstChords` (setlist rows, shared-list rows, override editor, shared key panel): a visible "First chords" label leads the slots
- [x] `KeyPanel`: a visible "First chords in <key>" heading over the chord grid (was screen-reader only)

## Acceptance criteria
- [x] Unit tests cover both labels; existing setlist, share and song-page tests pass unchanged
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): none
- **Touches** (small integration edits only; describe each in the PR): `features/lists/ui/ItemOverrideEditor.tsx`, `features/lists/ui/ItemOverrideEditor.test.tsx`, `components/song/panels/KeyPanel.tsx`, `components/song/panels/KeyPanel.test.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
