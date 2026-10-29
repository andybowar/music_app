---
id: AUTH-06
title: "Account linking + deprovisioning"
phase: 4
wave: 8
stream: auth
size: S
status: todo
human_required: false
depends_on: ["AUTH-02", "ADM-01", "AUTH-07"]
blocks: []
owns: ["features/auth/linking.ts"]
touches: ["features/auth/provision.ts"]
requirements: ["REQ-AUTH-05", "REQ-AUTH-06", "REQ-AUTH-03"]
---

# AUTH-06 · Account linking + deprovisioning


**Goal.** Same person, one account; removed people lose access.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/ui.md`
- Output of `AUTH-02` (merged on main)
- Output of `ADM-01` (merged on main)
- Output of `AUTH-07` (merged on main): pending accounts and `provisionUser`

## Requirements
- `REQ-AUTH-05` — An SSO identity links to an existing account with the same verified email.
- `REQ-AUTH-06` — Disabled users (`users.disabled_at` set) cannot sign in or use existing sessions.

## Deliverables
- [ ] SSO login with verified email matching an existing password user links instead of duplicating
- [ ] Admin "disable" revokes sessions (Supabase admin signOut)
- [ ] Session max age 30 days
- [ ] Linking keeps the existing account's access status: an SSO identity linked to a pending or rejected account doesn't approve it, and a linked identity never creates a second (pending) account

## Acceptance criteria
- [ ] Tests for link-by-email and disabled-user rejection
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/auth/linking.ts`
- **May touch** (minimal integration edits only, described in PR): `features/auth/provision.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
