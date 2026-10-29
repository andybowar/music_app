---
id: LIST-03
title: "Override resolution (pure)"
phase: 3
wave: 4
stream: backend
size: S
status: done
human_required: false
depends_on: ["F-03", "F-04"]
blocks: ["LIST-01"]
owns: ["lib/lists/"]
touches: []
requirements: ["REQ-LIST-04"]
---

# LIST-03 · Override resolution (pure)


**Goal.** Decide what a setlist row shows.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md#pure-modules`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `F-03` (merged on main)
- Output of `F-04` (merged on main)

## Requirements
- `REQ-LIST-04` — Setlist per-song overrides: key, BPM, energy — independent of library files. If no `song_keys` row exists for the override key, first chords display **"X"** and resources are empty, with a prompt to upload files for that key.

## Deliverables
- [x] `resolveItemDisplay` + tests using fixtures (override to existing key, to missing key → X + needsUpload, no overrides, bpm/energy only)

## Acceptance criteria
- [x] 100% branch coverage
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `lib/lists/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
