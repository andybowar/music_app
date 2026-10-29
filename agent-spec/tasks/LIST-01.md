---
id: LIST-01
title: "Lists server (create/get/list/rename/delete)"
phase: 3
wave: 8
stream: backend
size: M
status: todo
human_required: false
depends_on: ["LIB-01", "LIST-03", "AUTH-05"]
blocks: ["BR-01", "BR-03", "LIST-07", "LIST-08", "SHR-01", "LIST-09"]
owns: ["features/lists/server/lists.ts"]
touches: []
requirements: ["REQ-LIST-01", "REQ-LIST-03", "REQ-LIST-06", "REQ-LIST-07", "REQ-LIST-08"]
---

# LIST-01 · Lists server (create/get/list/rename/delete)


**Goal.** List persistence and ListDetail assembly.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `LIB-01` (merged on main)
- Output of `LIST-03` (merged on main)
- Output of `AUTH-05` (merged on main)

## Requirements
- `REQ-LIST-01` — Create setlist or playlist: enter event date + name. It becomes the session's *current list*.
- `REQ-LIST-03` — Setlist: edit, reorder (drag and drop), rename, delete, share.
- `REQ-LIST-06` — Lists persist until manually deleted (soft delete).
- `REQ-LIST-07` — Open Setlist / Open Playlist show the user's lists and their branch's lists; upcoming events first.
- `REQ-LIST-08` — Setlists are readable by all members (supports "what other branches are using"); playlists are private to their owner unless shared.

## Deliverables
- [ ] Functions per contract; getList resolves items via resolveItemDisplay
- [ ] listLists: scope mine/branch/all; upcoming (event_date ≥ today) first asc, then past desc
- [ ] Soft delete

## Acceptance criteria
- [ ] Member cannot read another user's playlist; can read any setlist
- [ ] Same-branch music leader can rename a setlist
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/lists/server/lists.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
