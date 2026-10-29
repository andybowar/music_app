---
id: AUTH-03
title: "SAML SSO"
phase: 0
wave: 7
stream: auth
size: S
status: todo
human_required: false
depends_on: ["AUTH-02", "AUTH-07"]
blocks: []
owns: ["features/auth/saml.ts", "docs/ops/saml.md"]
touches: ["features/auth/ui/SsoButtons.tsx", "features/auth/actions.ts"]
requirements: ["REQ-AUTH-01", "REQ-AUTH-03"]
---

# AUTH-03 · SAML SSO


**Goal.** SAML 2.0 login for the organization IdP, behind a feature flag.

## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md`
- `agent-spec/contracts/api.md`
- `agent-spec/contracts/permissions.md`
- `agent-spec/contracts/ui.md`
- Output of `AUTH-02` (merged on main)
- Output of `AUTH-07` (merged on main): `provisionUser` creates new accounts `pending`

## Requirements
- `REQ-AUTH-01` — Users sign in with SSO: OIDC (Google, Microsoft) and SAML 2.0 for the organization's identity provider.

## Deliverables
- [ ] "Sign in with your organization" → enter email → `signInWithSSO({ domain })`
- [ ] Hidden unless `FEATURE_SAML=true`
- [ ] docs/ops/saml.md: how to register IdP metadata with Supabase CLI, attribute mapping for groups
- [ ] A first-time SAML user goes through `provisionUser` and is created `pending`, like OIDC users (REQ-AUTH-03)

## Acceptance criteria
- [ ] Flag off: no SAML UI rendered
- [ ] Flag on with no provider for domain: friendly error
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/auth/saml.ts`, `docs/ops/saml.md`
- **May touch** (minimal integration edits only, described in PR): `features/auth/ui/SsoButtons.tsx`, `features/auth/actions.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
