---
id: SRCH-08
title: "ResultsList"
phase: 2
wave: 6
stream: frontend
size: S
status: todo
human_required: false
depends_on: ["UI-05"]
blocks: ["SRCH-09"]
owns: ["features/search/ui/ResultsList.tsx", "app/dev/results/"]
touches: []
requirements: []
---

# SRCH-08 · ResultsList


**Goal.** Render result rows with infinite scroll.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `UI-05` (merged on main)

## Deliverables
- [ ] Count header ("8 songs"), skeletons, empty state with "clear filters" action, load-more sentinel

## Acceptance criteria
- [ ] 1,000 fixture rows scroll smoothly (virtualize if needed)
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/search/ui/ResultsList.tsx`, `app/dev/results/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
