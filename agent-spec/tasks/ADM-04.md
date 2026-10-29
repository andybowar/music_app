---
id: ADM-04
title: "Access request emails"
phase: 4
wave: 11
stream: backend
size: S
status: todo
human_required: false
depends_on: ["SHR-03", "AUTH-07", "ADM-01"]
blocks: []
owns: ["features/admin/notifications.ts", "emails/AccessRequested.tsx", "emails/AccessApproved.tsx"]
touches: ["features/auth/actions.ts", "features/auth/provision.ts", "features/admin/server.ts"]
requirements: ["REQ-AUTH-08"]
---

# ADM-04 · Access request emails


**Goal.** Admins hear about new access requests without checking the admin page, and people hear when they've been let in.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md` (REQ-AUTH-08)
- `agent-spec/contracts/api.md` (`lib/email.ts` `sendEmail`, `approveUser`)
- `agent-spec/change-requests/OWNER-access-approval.md`
- Output of `SHR-03` (merged on main): `lib/email.ts`, react-email setup
- Output of `AUTH-07` (merged on main): `signUpWithPassword`, `provisionUser` creating pending users
- Output of `ADM-01` (merged on main): `approveUser`, the access-requests view

## Requirements
- `REQ-AUTH-08` — Admins are emailed about new requests, and users are emailed when approved.

## Deliverables
- [ ] `notifyAccessRequested(user)`: emails every approved admin with the requester's name, email, provider, suggested branch and a link to the admin access-requests view
- [ ] `notifyAccessApproved(user)`: emails the user that they can sign in, with a link to `/login`
- [ ] Called from `signUpWithPassword` / `provisionUser` on new pending accounts, and from `approveUser` (touches). A failed email never fails the sign-up or approval; log and continue
- [ ] Rejection sends no email (the account-status page explains it)

## Acceptance criteria
- [ ] Integration test with local Supabase + Mailpit: sign-up → admins receive "access requested"; approve → user receives "approved"
- [ ] Unit tests for both templates and for the "email failure doesn't block" path
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/admin/notifications.ts`, `emails/AccessRequested.tsx`, `emails/AccessApproved.tsx`
- **Touches** (small integration edits only; describe each in the PR): `features/auth/actions.ts`, `features/auth/provision.ts`, `features/admin/server.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
