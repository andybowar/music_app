---
id: LIB-07
title: "External links + YouTube parsing"
phase: 1
wave: 7
stream: backend
size: S
status: in_progress
human_required: false
depends_on: ["DB-06", "AUTH-04", "AUTH-05"]
blocks: ["IMP-03", "LIB-17"]
owns: ["features/resources/server/links.ts", "lib/youtube.ts"]
touches: []
requirements: ["REQ-LIB-09"]
---

# LIB-07 · External links + YouTube parsing


**Goal.** Attach YouTube/instruction links to keys.

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
- `REQ-LIB-09` — Files attach to a specific key: full score PDF, lead sheet PDF, chord chart PDF (several allowed), MP3. Links attach to a key: YouTube, other audio/video, instruction links.

## Deliverables
- [ ] addLink/updateLink; `parseYouTubeId` pure function

## Acceptance criteria
- [ ] parseYouTubeId handles watch, youtu.be, shorts, embed, with extra params; rejects non-YouTube
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/resources/server/links.ts`, `lib/youtube.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
