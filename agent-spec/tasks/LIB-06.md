---
id: LIB-06
title: "File uploads + signed URLs"
phase: 1
wave: 7
stream: backend
size: M
status: todo
human_required: false
depends_on: ["DB-06", "AUTH-04", "AUTH-05"]
blocks: ["IMP-03", "LIB-17", "LIB-18", "SRCH-09"]
owns: ["lib/storage.ts", "features/resources/server/files.ts"]
touches: []
requirements: ["REQ-LIB-09", "REQ-LIB-10", "REQ-LIB-11"]
---

# LIB-06 · File uploads + signed URLs


**Goal.** Private file storage per song/key.

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
- `REQ-LIB-10` — Projection files (`.pro`, `.mdb`, `.ppt`, `.pptx`) attach to the song, independent of key.
- `REQ-LIB-11` — All files are private; served only to signed-in users via short-lived signed URLs.

## Deliverables
- [ ] Storage helpers + actions per contract
- [ ] Validation via KIND_FORMATS, MAX_UPLOAD_BYTES, mime sniff on finalize
- [ ] deleteResource removes object then row

## Acceptance criteria
- [ ] Integration test against local storage: request → PUT → finalize → signed URL fetch returns bytes
- [ ] Projection with songKeyId → VALIDATION; PDF as audio → VALIDATION
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `lib/storage.ts`, `features/resources/server/files.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
