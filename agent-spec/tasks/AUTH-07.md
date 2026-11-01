---
id: AUTH-07
title: "Self sign-up + account-status page"
phase: 0
wave: 6
stream: auth
size: M
status: done
human_required: false
depends_on: ["DB-07", "AUTH-01", "AUTH-02"]
blocks: ["AUTH-03", "AUTH-06", "ADM-04"]
owns: ["app/(auth)/signup/", "app/(auth)/account-status/", "features/auth/ui/SignupForm.tsx", "features/auth/ui/AccountStatus.tsx"]
touches: ["features/auth/actions.ts", "features/auth/provision.ts", "app/(auth)/login/page.tsx"]
requirements: ["REQ-AUTH-03", "REQ-AUTH-04", "REQ-AUTH-08"]
---

# AUTH-07 · Self sign-up + account-status page


**Goal.** Anyone can request an account (password or SSO). New accounts wait for an admin, and their owners can see where their request stands.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md` (REQ-AUTH-03, -04, -08, and the §6 entries on SSO approval and email confirmation)
- `agent-spec/contracts/api.md` (`signUpWithPassword`, `provisionUser`)
- `agent-spec/contracts/ui.md` (`/signup`, `/account-status`)
- `agent-spec/change-requests/OWNER-access-approval.md`
- Output of `DB-07` (merged on main): `access_status` column, types, fixtures
- Output of `AUTH-01` (merged on main): login and reset pages, `features/auth/actions.ts`
- Output of `AUTH-02` (merged on main): `features/auth/provision.ts`, `/auth/callback`

## Requirements
- `REQ-AUTH-03` — Anyone can request an account; new accounts start pending and can see no data until an admin approves them.
- `REQ-AUTH-04` — On first SSO login, the IdP group mapping suggests branch and role; the account is still pending.
- `REQ-AUTH-08` — Pending and rejected users who sign in see only an account-status page.

## Deliverables
- [x] `/signup`: name, email, password (same rules as reset), with loading, error and success states. Success says the request is waiting for an admin
- [x] `signUpWithPassword` in `features/auth/actions.ts` (touch): creates the auth user and a `pending` `users` row. The response is the same whether or not the email already exists
- [x] `provisionUser` (touch): a brand-new SSO user is created `pending` with the group-mapped branch filled in as a suggestion, instead of being refused for an unmapped group. Existing users keep their status. Disabled users are still refused
- [x] `/account-status`: shows "awaiting approval" or "request declined" for the signed-in user, plus sign out. It reads only the user's own row
- [x] `/login` (touch): a "Request access" link to `/signup`
- [x] A `/dev/<name>` gallery page for `SignupForm` and `AccountStatus`, or a change request if no `app/dev/` path is owned

## Acceptance criteria
- [x] Integration tests against local Supabase: password sign-up creates a `pending` row; SSO provisioning creates `pending` (mapped and unmapped groups); repeat sign-in leaves status unchanged; signing up with an existing email gives the generic response
- [x] Unit tests for the form and status page (validation, states, keyboard, 360px)
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Notes
- Blocking pending users from `(app)` routes is AUTH-04's job (`requireUser` and middleware redirect to `/account-status`). The approval queue is ADM-01's, and emails are ADM-04's.

## Boundaries
- **Owns** (create/modify freely): `app/(auth)/signup/`, `app/(auth)/account-status/`, `features/auth/ui/SignupForm.tsx`, `features/auth/ui/AccountStatus.tsx`
- **Touches** (small integration edits only; describe each in the PR): `features/auth/actions.ts`, `features/auth/provision.ts`, `app/(auth)/login/page.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
