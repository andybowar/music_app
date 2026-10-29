# CR AUTH-02 · Enable Google + Microsoft in Supabase config; small contract notes

**Status:** proposed (AUTH-02). Needs approval.

## 1. `supabase/config.toml` needs the Google and Azure providers (F-01 owns it)

### Problem

AUTH-02 builds the OIDC flow (`signInWithOidc` → IdP → Supabase → `/auth/callback` →
`provisionUser`), but Supabase only issues an authorize URL that works if the provider is
enabled in Auth. Locally, that is `supabase/config.toml`. It has no `[auth.external.google]`
or `[auth.external.azure]` section, so the button's redirect fails with
"Unsupported provider: provider is not enabled".

### Proposed change

Add the following to `supabase/config.toml`, next to `[auth.external.apple]`. Secrets come
from env substitution and are never committed:

```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"
redirect_uri = ""
url = ""
# Supabase docs: required for local sign-in with Google.
skip_nonce_check = true
email_optional = false

[auth.external.azure]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_AZURE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_AZURE_SECRET)"
redirect_uri = ""
# Single-tenant: the organization's Entra ID issuer,
# https://login.microsoftonline.com/<tenant-id>/v2.0
url = "env(SUPABASE_AUTH_EXTERNAL_AZURE_URL)"
skip_nonce_check = false
email_optional = false
```

Also widen `additional_redirect_urls` so `/auth/callback?next=…` is allowed for both hosts.
The query string is the reason:

```diff
-additional_redirect_urls = ["http://127.0.0.1:3000/auth/callback", "http://localhost:3000/auth/callback"]
+additional_redirect_urls = ["http://127.0.0.1:3000/auth/callback**", "http://localhost:3000/auth/callback**"]
```

Locally, `127.0.0.1:3000` is already allowed because it shares a host with `site_url`.

### Env vars (add to `.env.example` under "Auth / SSO", F-01/F-05)

| Var | Where | Purpose |
|---|---|---|
| `SSO_PROVIDERS` | app (already in `lib/env.ts`) | `google,microsoft`, or a subset. Controls which buttons render and which providers `signInWithOidc` accepts. |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` | Supabase CLI (local) | Google OAuth client (Web application). |
| `SUPABASE_AUTH_EXTERNAL_AZURE_CLIENT_ID` / `_SECRET` / `_URL` | Supabase CLI (local) | Entra ID app registration. `_URL` is the tenant issuer URL. |

Hosted projects: enable Google and Azure under Auth → Providers with the same values. Add
`${APP_URL}/auth/callback**` (and the Vercel preview pattern) under Auth → URL Configuration →
Redirect URLs.

**IdP side.** The redirect URI registered at Google and Entra ID is Supabase's, not the app's:
`http://127.0.0.1:54321/auth/v1/callback` locally, and
`https://<project-ref>.supabase.co/auth/v1/callback` hosted.

**Affects:** F-01 (`supabase/config.toml`, `.env.example`), ops docs.

## 2. IdP groups for branch mapping (REQ-AUTH-04)

`provisionUser` maps IdP groups to `branches.sso_group`. It reads the group names from
`user_metadata.groups`, `user_metadata.custom_claims.groups` (where Supabase puts non-standard
ID-token claims), and `app_metadata.groups`.

- **Google OIDC sends no group claim.** Google users can only sign in when they already have an
  account: an admin invite, or a password account with the same verified email, which Supabase
  links automatically (REQ-AUTH-05).
- **Entra ID** must be configured to emit a `groups` claim in the ID token. In the app
  registration, go to Token configuration → Add groups claim → "Groups assigned to the
  application", and emit them as **sAMAccountName / cloud-only group display names**. Otherwise
  `groups` holds object IDs, and `branches.sso_group` must be set to those IDs. Whether
  Supabase's Azure provider passes `groups` through needs checking with a real tenant. If it
  doesn't, a Supabase custom access-token hook, or an admin, can set `app_metadata.groups`.
- REQ-AUTH-03 also mentions an IdP **domain** mapping to a branch. The schema has no domain
  column, so AUTH-02 maps groups only. If domain mapping is wanted, add `branches.sso_domain`
  (DB task) and extend `branchForGroups`.

**Decision needed (human):** AUTH-02 rejects a **new** SSO identity with no mapped group
(`FORBIDDEN`, "not linked to a branch yet"). It doesn't create a branchless member, because
REQ-AUTH-03 forbids public signup, and with Google any personal account could otherwise sign
in. "Unknown group → branch null" applies to **existing** accounts (invited users), which sign
in with `branch_id` left null. If the org prefers auto-creating branchless members for a
trusted tenant, that is a one-line change in `provisionUser`.

**Affects:** none (documentation), or DB/AUTH if domain mapping is added.

## 3. Contract notes (additive)

- `signInWithOidc(provider)` gained an optional second argument:
  `signInWithOidc(provider, next?: string)`. `next` is sanitized with `safeNext` and passed
  through `/auth/callback?next=…`, so SSO honors the return path the same way password sign-in
  does. Existing callers are unaffected.
- `provisionUser(authUser, idpGroups)` throws `ActionError` instead of returning when the user
  must not be signed in: `FORBIDDEN` for disabled or unmapped users, and `CONFLICT` when the
  email belongs to an unlinked account. The callback catches it, signs out, and redirects to
  `/login?error=<code>`.
- **Orphaned auth users.** A rejected first login leaves the `auth.users` row Supabase created,
  with no `public.users` row. That row is harmless, since RLS gives it no role, but **AUTH-06
  (admin invite)** must handle an email that already exists in `auth.users`, for example by
  creating the `public.users` row for the existing auth id.
- **No `/dev/sso-buttons` gallery page.** `app/dev/` isn't in AUTH-02's owned paths. `/login`
  with `SSO_PROVIDERS=google,microsoft` and `?error=sso_no_account` shows every state. Proposed:
  add `app/dev/sso-buttons/` to AUTH-02's owns, or leave it to the gallery owner.
- `users` provisioning writes no `audit_log` row, because `lib/audit` covers song-related
  entities. AUTH-06 or ADM tasks may want user audit later.

**Affects:** `contracts/api.md` (AUTH-02 row), AUTH-06.
