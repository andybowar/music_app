---
id: CNT-01
title: "Theme vocabulary v1 (draft)"
phase: 1
wave: 4
stream: content
size: S
status: todo
human_required: false
depends_on: ["F-04"]
blocks: ["CNT-02", "H-02"]
owns: ["content/themes-v1.json", "content/themes-v1.md"]
touches: []
requirements: []
---

# CNT-01 · Theme vocabulary v1 (draft)


**Goal.** Starter list of ~150 normalized worship themes with synonyms.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- Output of `F-04` (merged on main)

## Deliverables
- [ ] JSON `{ name, synonyms[] }[]`; grouped markdown for human review (e.g. Lamb / lamb of god → one theme)

## Acceptance criteria
- [ ] All names pass themeNameSchema; no duplicates across names/synonyms
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `content/themes-v1.json`, `content/themes-v1.md`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes
Agent drafts; a music leader approves before seeding production.
