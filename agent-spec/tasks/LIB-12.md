---
id: LIB-12
title: "Song form: Lyrics section (chorus, verses 1–5, bridge)"
phase: 1
wave: 5
stream: frontend
size: M
status: done
human_required: false
depends_on: ["LIB-10", "LIB-16"]
blocks: ["LIB-17"]
owns: ["features/songs/ui/form/LyricsSection.tsx", "app/dev/form-lyrics/"]
touches: []
requirements: ["REQ-LIB-06", "REQ-LIB-14"]
---

# LIB-12 · Song form: Lyrics section (chorus, verses 1–5, bridge)


**Goal.** Enter a complete song and its arrangement.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `LIB-10` (merged on main)
- Output of `LIB-16` (merged on main)

## Requirements
- `REQ-LIB-06` — Full lyrics stored per section: chorus, verse 1–5, bridge (7 sections), plus an **arrangement** (ordered list of sections as sung, repeats allowed).
- `REQ-LIB-14` — Paste-and-split helper: paste full lyrics with section headings and have them split into the 7 section fields + arrangement.

## Deliverables
- [x] 7 section textareas (verses 3–5 collapsed until used)
- [x] Arrangement builder: chips for non-empty sections, drag to order, repeats allowed
- [x] "Paste full lyrics" dialog calling `parseLyrics` (from `@/lib/lyrics/parse`)

## Acceptance criteria
- [x] Emptying a section removes it from arrangement with a warning
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/songs/ui/form/LyricsSection.tsx`, `app/dev/form-lyrics/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
