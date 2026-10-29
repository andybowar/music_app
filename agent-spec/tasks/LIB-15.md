---
id: LIB-15
title: "Song form: Branch usage section"
phase: 1
wave: 5
stream: frontend
size: S
status: in_progress
human_required: false
depends_on: ["LIB-10"]
blocks: ["LIB-17"]
owns: ["features/songs/ui/form/UsageSection.tsx", "app/dev/form-usage/"]
touches: []
requirements: ["REQ-LIB-05"]
---

# LIB-15 · Song form: Branch usage section


**Goal.** Per-branch usage grid.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `LIB-10` (merged on main)

## Requirements
- `REQ-LIB-05` — Branch usage per branch: `high | low | rare | none`.

## Deliverables
- [ ] Row per branch × segmented control high/low/rare/none; derived values shown with a "derived" badge

## Acceptance criteria
- [ ] Dev page with 4 fixture branches
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/songs/ui/form/UsageSection.tsx`, `app/dev/form-usage/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
