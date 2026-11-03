# CR AUTH-06 · Wire session revocation into "disable", and cap sessions at 30 days

**Status:** rejected by project owner 2026-11-03. `updateUser` does not revoke sessions and no session time-box is set; access still stops on the next request (middleware, `requireUser`, RLS). `revokeUserSessions` stays in `features/auth/linking.ts`, unused.

AUTH-06 owns `features/auth/linking.ts` and touches `features/auth/provision.ts`. Two of its
deliverables need one-line changes in files other tasks own.

## 1. Admin "disable" must revoke sessions (ADM-01 owns `features/admin/server.ts`)

### Problem

`updateUser(id, { disabled: true })` sets `users.disabled_at` but leaves the user's Supabase
sessions alive. Access already stops on the next request: `middleware.ts` (RLS hides a disabled
user's own row, so the middleware signs them out), `requireUser` (returns `null` and signs out),
RLS (`app_user_role()` is null), and both sign-in paths refuse them. The refresh tokens are
still valid, though, and a 1-hour access token still authenticates against Supabase Auth.

`supabase.auth.admin.signOut(jwt)` needs the *user's* JWT, which the admin doesn't have, so
AUTH-06 provides the equivalent of a global sign-out:

```ts
// features/auth/linking.ts (server-only)
export async function revokeUserSessions(db: DB | Tx, userId: string): Promise<number>;
```

It deletes the user's `auth.sessions` rows. That cascades to `auth.refresh_tokens`, and Supabase
then answers `getUser()` for a live access token with `session_not_found`.
`linking.int.test.ts` covers this against the local stack.

### Proposed change

In `updateUser`, inside the existing `withTx`, after the `users` update:

```diff
+import { revokeUserSessions } from '@/features/auth/linking';
 …
       if (!after) throw new ActionError('NOT_FOUND', 'That user no longer exists.');
+      // REQ-AUTH-06: a newly disabled user loses every session now (AUTH-06).
+      if (after.disabledAt && !before.disabledAt) await revokeUserSessions(tx, userId);
```

Plus an assertion in `features/admin/server.int.test.ts`: after disabling a user who has a
password session, `auth.sessions` has no rows for them.

**Affects:** ADM-01 (one integration edit plus a test). No contract change.

## 2. Session max age 30 days (F-01 owns `supabase/config.toml`; ops docs)

### Problem

Supabase sessions never expire by default; only the 1-hour access token rotates. A hard cap
is a Supabase Auth setting, not app code.

### Proposed change

`supabase/config.toml`:

```diff
-# [auth.sessions]
-# Force log out after the specified duration.
-# timebox = "24h"
+[auth.sessions]
+# Force log out after the specified duration (AUTH-06: session max age 30 days).
+timebox = "720h"
 # Force log out if the user has been inactive longer than the specified duration.
 # inactivity_timeout = "8h"
```

Hosted: Dashboard → Authentication → Sessions → "Time-box user sessions" = 720 hours. This
needs the Pro plan; add it to `HUMAN-TASKS.md` / the ops docs. With `jwt_expiry = 3600`, a
session ends at most 30 days + 1 hour after sign-in.

**Affects:** F-01 (`supabase/config.toml`), ops docs / HUMAN-TASKS (hosted setting).

## 3. Note: provisioning test fixtures

AUTH-06 links an SSO identity to an existing account only when the IdP marked the email as
verified (`identity_data.email_verified === true`, the claim Supabase stores for Google).
The synthetic identities in `features/auth/provision.test.ts` and
`features/auth/provision.int.test.ts` now include that claim, as real ones do. The unit mock
transaction also gained `execute` for `revokeUserSessions`. The AUTH-06 PR describes both
fixture edits; they don't change any assertion's meaning.
