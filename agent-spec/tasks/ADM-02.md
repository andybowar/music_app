---
id: ADM-02
title: "Admin: branches"
phase: 1
wave: 8
stream: frontend
size: S
status: done
human_required: false
depends_on: ["ADM-01"]
blocks: []
owns: ["app/(app)/admin/branches/", "features/admin/ui/branches/"]
touches: ["features/admin/server.ts"]
requirements: []
---

# ADM-02 · Admin: branches


**Goal.** Manage branches, codes, SSO group mapping.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `ADM-01` (merged on main)

## Deliverables
- [x] CRUD for name, code, sso_group (no delete if referenced)

## Acceptance criteria
- [x] Code uniqueness error shown inline
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `app/(app)/admin/branches/`, `features/admin/ui/branches/`
- **May touch** (minimal integration edits only, described in PR): `features/admin/server.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
