# CR DB-05 · `can()` ignores `accessStatus`

**Status:** proposed (not approved).

## Problem

`contracts/permissions.md` says: "Users whose `access_status` is not `'approved'` (pending or rejected, DB-07) can do nothing either, except read their own `users` row." DB-05's deliverable is to show RLS and `can()` both deny everything for pending and rejected users.

RLS already does this: since `0004_access_status.sql`, `app_user_role()` / `app_user_branch()` return null for non-approved users, so every policy denies them.

`lib/permissions.ts` (AUTH-05) does not. Its guard is

```ts
if (user === null || user.disabledAt !== null) return false;
```

so a pending or rejected user gets the same answer from `can()` as an approved user with that role. For example, a pending admin passes `can(user, 'admin:users')`.

In practice the app is still protected: `requireUser()` (lib/auth.ts) throws for non-approved users before any action reaches `assertCan`, and `requirePageUser()` redirects them. But `can()` doesn't match the contract on its own, and any code path that calls `can()` with an `AppUser` that didn't come from `requireUser` (e.g. a user loaded by an admin screen, a cron job, or a test) would get the wrong answer.

DB-05 (`tests/db/rls.test.ts`) finds the mismatch in 188 cases: every pending/rejected role × action where the approved role would be allowed. They are marked `test.fails` with a reference to this CR.

## Proposed change (AUTH-05's file, `lib/permissions.ts`)

```diff
 export function can(user: AppUser | null, action: Action, ctx?: PermCtx): boolean {
-  if (user === null || user.disabledAt !== null) return false;
+  if (user === null || user.disabledAt !== null || user.accessStatus !== 'approved') return false;
   if (user.role === 'admin') return true;
```

Also update the JSDoc and add `pending` / `rejected` rows to `lib/permissions.test.ts`. No contract change is needed. The contract already says this.

## Affects

- **AUTH-05** (`lib/permissions.ts`, `lib/permissions.test.ts`): makes the edit.
- **DB-05** (`tests/db/rls.test.ts`): once the fix lands, the `test.fails` cases start passing, so `test.fails` reports them as failures. Remove `knownAccessStatusMismatch` (and `CR_ACCESS_STATUS`) in the same PR as the fix.
- Nothing else: `requireUser` already rejects non-approved users, so no server action changes behavior.
