---
id: LIB-18
title: "Song page"
phase: 1
wave: 8
stream: frontend
size: M
status: done
human_required: false
depends_on: ["LIB-01", "LIB-06", "UI-06", "UI-07", "UI-08", "UI-02"]
blocks: ["LIB-19", "H-01"]
owns: ["app/(app)/songs/[id]/page.tsx", "features/songs/ui/SongPage.tsx"]
touches: []
requirements: ["REQ-ROW-03", "REQ-ROW-04"]
---

# LIB-18 · Song page


**Goal.** Full view of one song.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `LIB-01` (merged on main)
- Output of `LIB-06` (merged on main)
- Output of `UI-06` (merged on main)
- Output of `UI-07` (merged on main)
- Output of `UI-08` (merged on main)
- Output of `UI-02` (merged on main)

## Requirements
- `REQ-ROW-03` — Lyrics open in a readable viewer showing sections in arrangement order.
- `REQ-ROW-04` — PDFs open in an in-app viewer; audio plays inline; projection files download.

## Deliverables
- [x] Header (row atoms), panels inline, LyricsViewer, files open in PdfViewer/InlineAudio via getSignedResourceUrl
- [x] Edit button for contributors
- [x] History tab slot (filled by LIB-19)

## Acceptance criteria
- [x] 404 for unknown or deleted song
- [x] Opening a PDF never exposes a non-signed URL
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `app/(app)/songs/[id]/page.tsx`, `features/songs/ui/SongPage.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
