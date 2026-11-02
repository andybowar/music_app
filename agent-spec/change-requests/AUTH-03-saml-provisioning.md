# CR AUTH-03 · Wire SAML into the login page and `provisionUser`

**Status:** proposed.

AUTH-03 ships `signInWithSaml` (`features/auth/actions.ts` → `features/auth/saml.ts`) and a `saml` prop on `SsoButtons`, all behind `FEATURE_SAML` (default `false`). Two integration points sit outside AUTH-03's owned and touched paths. Until they land, SAML is unreachable: there's no button, and a first-time SAML user is refused. With the flag off, which is the decided default (SPEC §6), nothing changes for anyone.

## 1. `/login` must pass the flag to `SsoButtons` (AUTH-01 owns `app/(auth)/login/page.tsx`)

### Problem

`SsoButtons` is a client component and can't read server env. The page only renders the SSO slot when an OIDC provider is enabled, and it never passes `saml`. So the "Sign in with your organization" button can't appear even with `FEATURE_SAML=true`.

### Proposed change

```diff
   const oidcProviders = (['google', 'microsoft'] as const).filter((p) =>
     env.SSO_PROVIDERS.includes(p),
   );
-  const ssoSlot: ReactNode = oidcProviders.length ? (
+  const saml = env.FEATURE_SAML;
+  const ssoSlot: ReactNode = oidcProviders.length || saml ? (
     <SsoButtons
       providers={oidcProviders}
       next={safeNext(next)}
       error={typeof error === 'string' ? error : null}
+      saml={saml}
     />
   ) : null;
```

The page already reads `env` per request (`searchParams` makes it dynamic), so this adds no build-time env read.

Add `"app/(auth)/login/page.tsx"` to AUTH-03's `touches`, as AUTH-02 and AUTH-07 already have it, and let an AUTH-03 follow-up make the edit. Alternatively, the AUTH-01 owner can apply it.

## 2. `provisionUser` must accept SAML identities (AUTH-02 owns `features/auth/provision.ts`; AUTH-06 is editing it)

### Problem

SAML sign-in returns through the same `/auth/callback` (`?code=` → `exchangeCodeForSession` → `provisionUser`). `provisionUser` starts with `currentOidcIdentity(authUser)`, which only recognizes `google` and `azure` identities. A SAML identity's provider is `sso:<provider-uuid>`, so the function throws `UNAUTHENTICATED` ("This sign-in method is not supported"). The callback then maps that to `?error=sso_no_account`. REQ-AUTH-03 and AUTH-03's deliverable ("a first-time SAML user goes through `provisionUser` and is created `pending`, like OIDC users") need this to work.

### Proposed change

`features/auth/saml.ts` (AUTH-03) already exports a tested pure helper:

```ts
export function currentSamlIdentity(user: Pick<User, 'identities'>): { providerId: string; subject: string } | null;
```

In `features/auth/provision.ts`:

```diff
+import { currentSamlIdentity } from '@/features/auth/saml';
 ...
-  const identity = currentOidcIdentity(authUser);
-  if (!identity) throw new ActionError('UNAUTHENTICATED', UNSUPPORTED_MESSAGE);
+  const oidc = currentOidcIdentity(authUser);
+  const saml = oidc ? null : currentSamlIdentity(authUser);
+  const identity: { provider: AuthProvider; subject: string } | null = oidc
+    ? oidc
+    : saml
+      ? { provider: 'saml', subject: saml.subject }
+      : null;
+  if (!identity) throw new ActionError('UNAUTHENTICATED', UNSUPPORTED_MESSAGE);
```

Nothing else changes. `authProvider: identity.provider` is already an `auth_provider` enum value, since `'saml'` exists in `AUTH_PROVIDERS`. New users are still created `pending`. `idpGroupsFromUser` already reads `user_metadata.groups` and `custom_claims.groups`, which is where the Supabase SAML attribute mapping in `docs/ops/saml.md` puts `groups`. Add one unit test for a `sso:<id>` identity and one for the `'saml'` provider row.

Since `saml.ts` is `server-only`, as `provision.ts` is, the import is safe. If importing a module that reads `env` is unwanted, move `currentSamlIdentity` into `provision.ts` verbatim instead.

**Affects:** AUTH-02 / AUTH-06 (`features/auth/provision.ts` and its test). No contract signature changes.

## 3. Contract note (additive)

`contracts/api.md` lists `signInWithSaml(emailOrDomain)`. AUTH-03 adds an optional `next`, `signInWithSaml(emailOrDomain, next?: string)`, mirroring CR AUTH-02 §3 for `signInWithOidc`. `next` is sanitized with `safeNext` and carried through `/auth/callback?next=…`. Existing callers are unaffected.

Error codes: `FORBIDDEN` when `FEATURE_SAML` is off, `VALIDATION` (`fieldErrors.emailOrDomain`) for a malformed email, `NOT_FOUND` with friendly text when no SAML provider is registered for the domain, and `RATE_LIMITED`.

**Affects:** `contracts/api.md` (AUTH-03 row).

## 4. No `/dev/sso-buttons` gallery page

`app/dev/` isn't in AUTH-03's paths, and CR AUTH-02 §3 left the SSO buttons gallery to the gallery owner. The SAML states (collapsed, email entry, pending, no-provider error, validation error) are covered by `features/auth/ui/SsoButtons.test.tsx`. A gallery page can render `<SsoButtons providers={['google']} next="/library" saml />` with a stubbed action.

**Affects:** gallery owner, if one is wanted.
