---
id: AUTH-03
title: "SAML SSO"
phase: 0
wave: 7
stream: auth
size: S
status: done
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
- [x] "Sign in with your organization" → enter email → `signInWithSSO({ domain })`
- [x] Hidden unless `FEATURE_SAML=true`
- [x] docs/ops/saml.md: how to register IdP metadata with Supabase CLI, attribute mapping for groups
- [ ] A first-time SAML user goes through `provisionUser` and is created `pending`, like OIDC users (REQ-AUTH-03)

## Acceptance criteria
- [x] Flag off: no SAML UI rendered
- [x] Flag on with no provider for domain: friendly error
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/auth/saml.ts`, `docs/ops/saml.md`
- **May touch** (minimal integration edits only, described in PR): `features/auth/ui/SsoButtons.tsx`, `features/auth/actions.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Notes (AUTH-03)

- The SAML button only appears on `/login` once CR `change-requests/AUTH-03-saml-provisioning.md` §1 lands. The page must pass `saml={env.FEATURE_SAML}` to `SsoButtons`, and that page isn't in AUTH-03's paths. `SsoButtons` and `signInWithSaml` are done and unit-tested.
- "First-time SAML user is created `pending`" is left unchecked. `provisionUser` (AUTH-02, being edited by AUTH-06) only recognizes OIDC identities. CR §2 proposes the change, using `currentSamlIdentity` from `features/auth/saml.ts`. Confirming it end to end also needs a real IdP on a paid Supabase plan.
- The "no provider for domain" error is unit-tested against Supabase's documented `sso_provider_not_found` / 404 response. It hasn't been checked against a real project, since `FEATURE_SAML` is off.

