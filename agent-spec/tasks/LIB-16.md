---
id: LIB-16
title: "Lyrics paste-and-split parser"
phase: 1
wave: 3
stream: backend
size: S
status: todo
human_required: false
depends_on: ["F-03"]
blocks: ["LIB-12", "LIB-17"]
owns: ["lib/lyrics/"]
touches: []
requirements: ["REQ-LIB-14"]
---

# LIB-16 · Lyrics paste-and-split parser


**Goal.** Pure function turning pasted lyrics into sections + arrangement.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md#pure-modules`
- `agent-spec/contracts/types.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/schema.md`
- Output of `F-03` (merged on main)

## Requirements
- `REQ-LIB-14` — Paste-and-split helper: paste full lyrics with section headings and have them split into the 7 section fields + arrangement.

## Deliverables
- [ ] `parseLyrics`, `firstLine` per contract
- [ ] ≥20 unit test cases (headings variants, repeats, pre-chorus fold, no headings, Windows line endings, >5 verses → warning)

## Acceptance criteria
- [ ] All tests pass; no I/O imports
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `lib/lyrics/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
