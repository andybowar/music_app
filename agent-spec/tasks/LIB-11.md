---
id: LIB-11
title: "Song form: Musical tags section"
phase: 1
wave: 5
stream: frontend
size: M
status: done
human_required: false
depends_on: ["UI-04", "LIB-10"]
blocks: ["LIB-17"]
owns: ["features/songs/ui/form/MusicalSection.tsx", "app/dev/form-musical/"]
touches: []
requirements: ["REQ-LIB-08"]
---

# LIB-11 · Song form: Musical tags section


**Goal.** Keys with first chords, BPM, time signature, energy.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `UI-04` (merged on main)
- Output of `LIB-10` (merged on main)

## Requirements
- `REQ-LIB-08` — Musical tags: one primary key + 0..n alternate keys; each key has first chords for intro, verse, chorus, bridge; tempo (BPM), time signature, energy level (5 levels, see §4), free-text energy notes (e.g. "starts light, slow build, big bridge build").

## Deliverables
- [x] Keys repeater: key select (MAJOR_KEYS + minor toggle), primary radio, 4 chord inputs validated by CHORD_RE
- [x] Energy select showing color + label; energy notes textarea

## Acceptance criteria
- [x] Cannot submit with zero or two primaries (inline error)
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/songs/ui/form/MusicalSection.tsx`, `app/dev/form-musical/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes
- Zero/two primaries show an inline error on the keys group; `validateMusical()` (exported from `MusicalSection.tsx`) returns the same errors so LIB-17 can block submit. Removing the primary row promotes the first remaining key.
- Also built: tempo (20–300), time signature (`TIME_SIGNATURE_RE`), energy notes (≤500), plus `MUSICAL_LIMITS`, `emptyMusicalInfo`, `musicalInfoFromSong` in `MusicalSection.tsx` (types.ts is LIB-10's).
- Assumed server field-error paths: `keys`, `keys.<i>`, `keys.<i>.key`, `keys.<i>.firstChords.<slot>`, `tempoBpm`, `timeSignature`, `energyLevel`, `energyNotes`.
