# CR LIB-03: `assertCan` should throw a real `ActionError`

**Status:** proposed

## Problem

`lib/permissions.ts` `assertCan` throws a plain `Error` with `name = 'ActionError'` and
`code = 'FORBIDDEN'` (written before `lib/action.ts` existed). `lib/action.ts` `withAction`
recognises deliberate errors with `error instanceof ActionError`, so a denied permission is
reported to Sentry and returned as `{ code: 'INTERNAL', message: 'Something went wrong…' }`
instead of `FORBIDDEN`. Every action following the contract pattern
(`requireUser` → `assertCan` → … inside `withAction`) is affected.

Reproduce: in a unit test, wrap `async () => assertCan(memberUser, 'composer:merge')` in
`withAction` and await it: result is `INTERNAL`.

## Proposed fix (either one)

1. **AUTH-05** (`lib/permissions.ts`): `import { ActionError } from '@/lib/action'` and
   `throw new ActionError('FORBIDDEN', …)`. `lib/action.ts` imports only `next/navigation`,
   `zod` and `lib/log`, so there is no cycle. The DB-05 RLS parity tests use only `can()`.
2. **DB-06** (`lib/action.ts`): also treat any error with `name === 'ActionError'` and a
   string `code` as an `ActionError` (duck typing).

Option 1 is simpler; no contract text changes (`permissions.md` already says
`assertCan … throws ActionError('FORBIDDEN')`).

## Affected tasks

- AUTH-05 / DB-06 owners: the fix plus a regression test.
- Every server-action task. LIB-03 works around it with a local `ensureCan()` built on `can()`
  (marked `TODO(CR)` in `features/songs/server/composers.ts`); it can switch back to
  `assertCan` once this lands.
