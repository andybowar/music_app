---
id: AUTH-06
title: "Account linking + deprovisioning"
phase: 4
wave: 8
stream: auth
size: S
status: done
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
- [x] SSO login with verified email matching an existing password user links instead of duplicating
- [x] Admin "disable" revokes sessions (Supabase admin signOut)
- [x] Session max age 30 days
- [x] Linking keeps the existing account's access status: an SSO identity linked to a pending or rejected account doesn't approve it, and a linked identity never creates a second (pending) account

## Acceptance criteria
- [x] Tests for link-by-email and disabled-user rejection
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/auth/linking.ts`
- **May touch** (minimal integration edits only, described in PR): `features/auth/provision.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes (AUTH-06)

- Linking: `features/auth/linking.ts` `resolveSsoAccount`, called from `provisionUser`. Supabase
  links verified emails automatically. The app also refuses a *new* link unless the IdP marked the
  account's email verified, and never creates a second account for an email that is already taken
  (compared case-insensitively).
- Deprovisioning: `revokeUserSessions` deletes `auth.sessions`, the admin equivalent of a global
  sign-out. `provisionUser` calls it for disabled users. Two pieces need one-line edits in files
  other tasks own, so they are filed as change requests in
  `agent-spec/change-requests/AUTH-06-deprovisioning.md`:
  - wiring it into ADM-01's `updateUser({ disabled: true })`;
  - the 30-day session cap (`[auth.sessions] timebox = "720h"`, plus the hosted setting).
