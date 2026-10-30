# CR DB-07 · One-line fallout edits outside DB-07's touches

**Status:** proposed by DB-07, 2026-10-30. Edits are already in the DB-07 PR; needs lead approval (or a request to split them out).

## Problem

DB-07 adds the contract field `AppUser.accessStatus` (required) and the column default `access_status = 'pending'` (contracts/types.md, contracts/schema.md). Both break code that DB-07 doesn't own or touch:

1. **Typecheck.** Every place that builds an `AppUser` literal fails to compile without the new field:
   - `fixtures/schemas.ts` (F-04). The task file says "`types/validation.ts` (`appUserSchema`)", but `appUserSchema` actually lives in `fixtures/schemas.ts`; `types/validation.ts` has no user schema and needed no change.
   - `features/auth/provision.ts` (AUTH-02), `toAppUser()`.
   - `app/(app)/layout.tsx` (UI-02), the `requireUser` stand-in's select.
   - `lib/permissions.test.ts` (AUTH-05), `makeUser()`.
2. **Existing integration tests.** With the default `'pending'`, users inserted without a status lose all RLS access or come back with a new field:
   - `tests/db/0003_rls.int.test.ts` (DB-03) inserts its users without `access_status`, so every RLS check would fail.
   - `features/auth/provision.int.test.ts` (AUTH-02) asserts the exact `AppUser` returned by first login.

`pnpm typecheck` and the `tests/db/` suites must pass (AGENTS.md §5, DB-07 acceptance criteria), so the PR can't merge without these edits.

## Change (already in the DB-07 PR)

| File | Edit |
|---|---|
| `fixtures/schemas.ts` | `appUserSchema` gains `accessStatus: z.enum(ACCESS_STATUSES)` |
| `features/auth/provision.ts` | `toAppUser` maps `accessStatus: row.accessStatus` (no behavior change; new SSO users now get the DB default `'pending'`, which AUTH-07 builds on) |
| `app/(app)/layout.tsx` | select `accessStatus` too (gating pending users stays AUTH-04's job) |
| `lib/permissions.test.ts` | `makeUser` defaults `accessStatus: 'approved'` |
| `tests/db/0003_rls.int.test.ts` | test users inserted with `access_status = 'approved'` |
| `features/auth/provision.int.test.ts` | expected first-login user includes `accessStatus: 'pending'` |

None of these change behavior: `can()` and `requireUser` don't look at `accessStatus` yet. AUTH-04 / AUTH-05 / AUTH-07 make that change.

## Affects

- **DB-07**: proposes and carries the edits.
- **AUTH-04, AUTH-05, AUTH-07**: start from code that already carries `accessStatus`.
- **Task file wording**: DB-07's touches should have listed `fixtures/schemas.ts` rather than `types/validation.ts`.
