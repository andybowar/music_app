---
id: AUTH-03
title: "SAML SSO"
phase: 0
wave: 6
stream: auth
size: S
status: todo
human_required: false
depends_on: ["AUTH-02"]
blocks: []
owns: ["features/auth/saml.ts", "docs/ops/saml.md"]
touches: ["features/auth/ui/SsoButtons.tsx", "features/auth/actions.ts"]
requirements: ["REQ-AUTH-01"]
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

## Requirements
- `REQ-AUTH-01` — Users sign in with SSO: OIDC (Google, Microsoft) and SAML 2.0 for the organization's identity provider.

## Deliverables
- [ ] "Sign in with your organization" → enter email → `signInWithSSO({ domain })`
- [ ] Hidden unless `FEATURE_SAML=true`
- [ ] docs/ops/saml.md: how to register IdP metadata with Supabase CLI, attribute mapping for groups

## Acceptance criteria
- [ ] Flag off: no SAML UI rendered
- [ ] Flag on with no provider for domain: friendly error
- [ ] Definition of Done in `AGENTS.md` §5 is satisfied

## Boundaries
- **Owns** (create/modify freely): `features/auth/saml.ts`, `docs/ops/saml.md`
- **May touch** (minimal integration edits only, described in PR): `features/auth/ui/SsoButtons.tsx`, `features/auth/actions.ts`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).
