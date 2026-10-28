---
id: LIB-19
title: "Song change history"
phase: 1
wave: 8
stream: frontend
size: S
status: todo
human_required: false
depends_on: ["LIB-18", "DB-06"]
blocks: []
owns: ["features/audit/"]
touches: ["features/songs/ui/SongPage.tsx"]
requirements: ["REQ-LIB-12"]
---

# LIB-19 · Song change history


**Goal.** Show who changed what.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `LIB-18` (merged on main)
- Output of `DB-06` (merged on main)

## Requirements
- `REQ-LIB-12` — Edits are recorded in an audit log (who, when, what changed) viewable on the song.

## Deliverables
- [ ] `getAuditTrail` read helper
- [ ] History tab: timeline of entries with field diffs

## Acceptance criteria
- [ ] Visible to contributor+; hidden for members
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/audit/`
- **May touch** (minimal integration edits only, described in PR): `features/songs/ui/SongPage.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
