---
id: ADM-01
title: "Admin: users"
phase: 1
wave: 7
stream: frontend
size: L
status: done
human_required: false
depends_on: ["AUTH-04", "AUTH-05", "UI-02", "DB-07"]
blocks: ["ADM-02", "AUTH-06", "ADM-04"]
owns: ["app/(app)/admin/users/", "features/admin/server.ts", "features/admin/ui/users/"]
touches: []
requirements: ["REQ-AUTH-03", "REQ-AUTH-07", "REQ-AUTH-08"]
---

# ADM-01 · Admin: users


**Goal.** Invite, approve or reject access requests, change role/branch, disable.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/ui.md`
- `agent-spec/contracts/types.md`
- Output of `AUTH-04` (merged on main)
- Output of `AUTH-05` (merged on main)
- Output of `UI-02` (merged on main)
- Output of `DB-07` (merged on main): `users.access_status`
- `agent-spec/contracts/api.md` (`approveUser`, `rejectUser`, `listUsers({ accessStatus? })`)
- `agent-spec/change-requests/OWNER-access-approval.md`

## Requirements
- `REQ-AUTH-03` — Anyone can request an account; new accounts start pending and can see no data until an admin approves them. Invited accounts are approved when created.
- `REQ-AUTH-07` — Roles: `member`, `contributor`, `music_leader`, `admin`. Permissions per `contracts/permissions.md`, enforced in Postgres RLS **and** server code.

## Deliverables
- [x] User table with search; invite by email (Supabase admin invite; invited users are `approved`); role + branch selects; disable/enable
- [x] Access requests: a view (tab or filter, with a count) of `pending` users showing name, email, provider, requested date and the SSO-suggested branch
- [x] `approveUser` (choose role, default `member`, and branch, pre-filled from the suggestion) and `rejectUser`, recording `access_decided_by/at` and an audit entry. Rejected users can be approved later

## Acceptance criteria
- [x] Non-admin → 403
- [x] Admin cannot demote the last admin
- [x] Approving lets the user in on their next request (with AUTH-04); rejecting sends them to `/account-status`
- [x] An admin can't approve or reject their own account; a non-admin calling `approveUser`/`rejectUser` gets FORBIDDEN
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `app/(app)/admin/users/`, `features/admin/server.ts`, `features/admin/ui/users/`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
