---
id: LIB-04
title: "Themes actions"
phase: 1
wave: 7
stream: backend
size: S
status: done
human_required: false
depends_on: ["DB-06", "AUTH-04", "AUTH-05"]
blocks: ["IMP-03", "LIB-17", "H-02"]
owns: ["features/themes/server.ts"]
touches: []
requirements: ["REQ-LIB-07"]
---

# LIB-04 · Themes actions


**Goal.** Shared normalized theme vocabulary with per-section tagging.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `DB-06` (merged on main)
- Output of `AUTH-04` (merged on main)
- Output of `AUTH-05` (merged on main)

## Requirements
- `REQ-LIB-07` — Lyric themes are tagged per section from a shared, normalized theme vocabulary; new themes can be created inline.

## Deliverables
- [x] searchThemes (prefix + trigram), createTheme (normalized, idempotent), setSongThemes, mergeThemes

## Acceptance criteria
- [x] "  Glory  Honor " and "glory honor" resolve to the same theme
- [x] merge moves all song_themes without duplicates
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/themes/server.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
