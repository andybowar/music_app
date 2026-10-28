---
id: SHR-04
title: "ShareDialog + nav Share wiring"
phase: 4
wave: 10
stream: frontend
size: S
status: todo
human_required: false
depends_on: ["SHR-01", "SHR-03", "LIST-09", "LIST-07", "PLAY-05"]
blocks: ["DOC-01", "H-05"]
owns: ["features/sharing/ui/"]
touches: ["features/lists/ui/NavListActions.tsx", "features/lists/ui/SetlistView.tsx", "features/player/ui/PlaylistView.tsx"]
requirements: ["REQ-NAV-04", "REQ-SHARE-01", "REQ-SHARE-02"]
---

# SHR-04 · ShareDialog + nav Share wiring


**Goal.** Share from nav and from list views.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `SHR-01` (merged on main)
- Output of `SHR-03` (merged on main)
- Output of `LIST-09` (merged on main)
- Output of `LIST-07` (merged on main)
- Output of `PLAY-05` (merged on main)

## Requirements
- `REQ-NAV-04` — Share acts on the *current list*; disabled when there is none.
- `REQ-SHARE-01` — Share a list via tokenized read-only link including modified tags (overrides); optional expiry; revocable.
- `REQ-SHARE-02` — Share a list by email (summary + link).

## Deliverables
- [ ] Copy link, expiry select (none/7d/30d), email recipients field, existing links with revoke

## Acceptance criteria
- [ ] Playwright: share link opened in fresh context shows the list
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/sharing/ui/`
- **May touch** (minimal integration edits only, described in PR): `features/lists/ui/NavListActions.tsx`, `features/lists/ui/SetlistView.tsx`, `features/player/ui/PlaylistView.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
