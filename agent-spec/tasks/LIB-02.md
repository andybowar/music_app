---
id: LIB-02
title: "Song keys action"
phase: 1
wave: 6
stream: backend
size: S
status: todo
human_required: false
depends_on: ["DB-06", "AUTH-04", "AUTH-05"]
blocks: ["IMP-03", "LIB-17"]
owns: ["features/songs/server/keys.ts"]
touches: []
requirements: ["REQ-LIB-08"]
---

# LIB-02 · Song keys action


**Goal.** Replace-all save of keys and first chords.

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
- `REQ-LIB-08` — Musical tags: one primary key + 0..n alternate keys; each key has first chords for intro, verse, chorus, bridge; tempo (BPM), time signature, energy level (5 levels, see §4), free-text energy notes (e.g. "starts light, slow build, big bridge build").

## Deliverables
- [ ] `setSongKeys` in a transaction; preserves ids of unchanged keys so resources stay attached
- [ ] Refuses to delete a key that still has resources (CONFLICT, lists them)

## Acceptance criteria
- [ ] Tests: exactly-one-primary enforced; rename key keeps resources; delete key with files → CONFLICT
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/songs/server/keys.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
