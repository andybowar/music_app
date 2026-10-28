---
id: LIB-14
title: "Song form: Files & links section"
phase: 1
wave: 5
stream: frontend
size: M
status: todo
human_required: false
depends_on: ["LIB-10", "UI-08"]
blocks: ["LIB-17"]
owns: ["features/songs/ui/form/ResourcesSection.tsx", "app/dev/form-resources/"]
touches: []
requirements: ["REQ-LIB-09", "REQ-LIB-10"]
---

# LIB-14 · Song form: Files & links section


**Goal.** Upload files and add links per key, plus projection files.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `LIB-10` (merged on main)
- Output of `UI-08` (merged on main)

## Requirements
- `REQ-LIB-09` — Files attach to a specific key: full score PDF, lead sheet PDF, chord chart PDF (several allowed), MP3. Links attach to a key: YouTube, other audio/video, instruction links.
- `REQ-LIB-10` — Projection files (`.pro`, `.mdb`, `.ppt`, `.pptx`) attach to the song, independent of key.

## Deliverables
- [ ] One block per key (from Musical section) + "Projection (any key)" block
- [ ] Dropzone with kind select; progress; retry; delete
- [ ] Link adder with label + URL; YouTube thumbnail preview

## Acceptance criteria
- [ ] Upload callbacks are props (`requestUpload`, `finalizeUpload`, `deleteResource`, `addLink`); dev page uses fakes
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/songs/ui/form/ResourcesSection.tsx`, `app/dev/form-resources/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes
Files can only be attached after the song has an id; on /songs/new this section shows "Save to add files".
