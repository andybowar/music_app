---
id: SHR-02
title: "Public share page"
phase: 4
wave: 10
stream: frontend
size: S
status: done
human_required: false
depends_on: ["SHR-01", "UI-05"]
blocks: []
owns: ["app/share/[token]/"]
touches: []
requirements: ["REQ-SHARE-01", "REQ-SHARE-03"]
---

# SHR-02 · Public share page


**Goal.** What a recipient sees.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `SHR-01` (merged on main)
- Output of `UI-05` (merged on main)

## Requirements
- `REQ-SHARE-01` — Share a list via tokenized read-only link including modified tags (overrides); optional expiry; revocable.
- `REQ-SHARE-03` — The public share page shows list content and overrides; opening files still requires sign-in.

## Deliverables
- [x] List header (name, date, branch), SongRows with overrides, "Sign in to open files" CTA
- [x] `noindex` meta

## Acceptance criteria
- [x] Works logged out; invalid token → friendly 404
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `app/share/[token]/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
