---
id: LIB-01
title: "Song server actions (create/update/delete/get)"
phase: 1
wave: 7
stream: backend
size: L
status: in_progress
human_required: false
depends_on: ["DB-02", "DB-06", "AUTH-04", "AUTH-05"]
blocks: ["IMP-03", "LIB-17", "LIB-18", "LIST-01", "SRCH-02"]
owns: ["features/songs/server/songs.ts", "features/songs/server/assemble.ts"]
touches: []
requirements: ["REQ-LIB-01", "REQ-LIB-02", "REQ-LIB-04", "REQ-LIB-06", "REQ-LIB-12"]
---

# LIB-01 · Song server actions (create/update/delete/get)


**Goal.** Core song persistence and the SongDetail assembler.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `DB-02` (merged on main)
- Output of `DB-06` (merged on main)
- Output of `AUTH-04` (merged on main)
- Output of `AUTH-05` (merged on main)

## Requirements
- `REQ-LIB-01` — Contributors+ create song entries and can later edit tags and files.
- `REQ-LIB-02` — Basic info: title, alternate titles (0..n), composers (1..n, ordered), source group, year composed.
- `REQ-LIB-04` — Who added: the adding branch is recorded automatically from the creator's branch (editable by admin).
- `REQ-LIB-06` — Full lyrics stored per section: chorus, verse 1–5, bridge (7 sections), plus an **arrangement** (ordered list of sections as sung, repeats allowed).
- `REQ-LIB-12` — Edits are recorded in an audit log (who, when, what changed) viewable on the song.

## Deliverables
- [ ] Actions per contract; `addedByBranchId` from creator unless admin sets it
- [ ] `assemble.ts`: build `SongDetail`/`SongSummary` from rows (keys primary-first, usage filled to every branch)
- [ ] Audit entries on create/update/delete

## Acceptance criteria
- [ ] Integration tests: contributor creates; member gets FORBIDDEN; invalid arrangement (section without lyrics) → VALIDATION with fieldErrors
- [ ] getSong of seeded "1000 Hallelujahs" deep-equals fixture
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/songs/server/songs.ts`, `features/songs/server/assemble.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
