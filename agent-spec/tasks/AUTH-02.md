---
id: AUTH-02
title: "OIDC SSO (Google, Microsoft) + user provisioning"
phase: 0
wave: 5
stream: auth
size: M
status: in_progress
human_required: false
depends_on: ["AUTH-01", "DB-06"]
blocks: ["AUTH-03", "AUTH-06"]
owns: ["app/(auth)/auth/callback/", "features/auth/provision.ts", "features/auth/ui/SsoButtons.tsx"]
touches: ["app/(auth)/login/page.tsx", "features/auth/actions.ts"]
requirements: ["REQ-AUTH-01", "REQ-AUTH-03", "REQ-AUTH-04"]
---

# AUTH-02 · OIDC SSO (Google, Microsoft) + user provisioning


**Goal.** Members sign in with their organization account.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/ui.md`
- Output of `AUTH-01` (merged on main)
- Output of `DB-06` (merged on main)

## Requirements
- `REQ-AUTH-01` — Users sign in with SSO: OIDC (Google, Microsoft) and SAML 2.0 for the organization's identity provider.
- `REQ-AUTH-03` — No public signup. Accounts are created by admin invite, or on first SSO login when the IdP domain/group maps to a branch.
- `REQ-AUTH-04` — On first SSO login, branch and role are derived from IdP group → `branches.sso_group`; default role `member`.

## Deliverables
- [ ] Provider buttons controlled by `env.SSO_PROVIDERS`
- [ ] Callback route exchanges code, calls `provisionUser`
- [ ] `provisionUser`: create `users` row on first login; branch from IdP group ↔ `branches.sso_group`; role `member`; set `auth_provider`, `sso_subject`, `last_login_at`
- [ ] Reject login if user is disabled

## Acceptance criteria
- [ ] Unit tests for provisionUser (new user, known group, unknown group → branch null, disabled user)
- [ ] Manual test steps documented in PR for real providers
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `app/(auth)/auth/callback/`, `features/auth/provision.ts`, `features/auth/ui/SsoButtons.tsx`
- **May touch** (minimal integration edits only, described in PR): `app/(auth)/login/page.tsx`, `features/auth/actions.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
