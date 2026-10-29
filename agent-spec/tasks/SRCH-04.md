---
id: SRCH-04
title: "useSearchState (URL-backed)"
phase: 2
wave: 3
stream: frontend
size: S
status: in_progress
human_required: false
depends_on: ["F-03"]
blocks: ["SRCH-05", "SRCH-06", "SRCH-07"]
owns: ["features/search/ui/useSearchState.ts"]
touches: []
requirements: ["REQ-SRCH-05", "REQ-NAV-03"]
---

# SRCH-04 · useSearchState (URL-backed)


**Goal.** Search params live in the URL.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `F-03` (merged on main)

## Requirements
- `REQ-SRCH-05` — "New search" keeps current parameters; parameters live in the URL so back/forward and shared URLs work.
- `REQ-NAV-03` — Home shows the default list (newest added first, then alphabetical) and **clears** search parameters.

## Deliverables
- [ ] Hook per contract using searchParamsSchema/serializeSearchParams; `router.replace` while typing (debounced 250ms), `push` on submit

## Acceptance criteria
- [ ] Unit tests with mocked router: newSearch keeps filters, clear removes all
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/search/ui/useSearchState.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
