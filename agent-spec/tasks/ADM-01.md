---
id: ADM-01
title: "Admin: users"
phase: 1
wave: 6
stream: frontend
size: M
status: todo
human_required: false
depends_on: ["AUTH-04", "AUTH-05", "UI-02"]
blocks: ["ADM-02", "AUTH-06"]
owns: ["app/(app)/admin/users/", "features/admin/server.ts", "features/admin/ui/users/"]
touches: []
requirements: ["REQ-AUTH-03", "REQ-AUTH-07"]
---

# ADM-01 · Admin: users


**Goal.** Invite, change role/branch, disable.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `AUTH-04` (merged on main)
- Output of `AUTH-05` (merged on main)
- Output of `UI-02` (merged on main)

## Requirements
- `REQ-AUTH-03` — No public signup. Accounts are created by admin invite, or on first SSO login when the IdP domain/group maps to a branch.
- `REQ-AUTH-07` — Roles: `member`, `contributor`, `music_leader`, `admin`. Permissions per `contracts/permissions.md`, enforced in Postgres RLS **and** server code.

## Deliverables
- [ ] User table with search; invite by email (Supabase admin invite); role + branch selects; disable/enable

## Acceptance criteria
- [ ] Non-admin → 403
- [ ] Admin cannot demote the last admin
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `app/(app)/admin/users/`, `features/admin/server.ts`, `features/admin/ui/users/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
