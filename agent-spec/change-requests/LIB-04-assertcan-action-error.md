# CR LIB-04: `assertCan` should throw a real `ActionError`

**Status:** proposed

## Problem

`contracts/api.md` says every action calls `assertCan(...)` inside `withAction`, and
`contracts/permissions.md` says `assertCan` "throws ActionError('FORBIDDEN')". The
implementation in `lib/permissions.ts` (AUTH-05) predates `lib/action.ts` (DB-06), so it
throws a plain `Error` with `name = 'ActionError'` and `code = 'FORBIDDEN'`.
`withAction` matches with `instanceof ActionError`, so a permission denial becomes
`{ code: 'INTERNAL', message: 'Something went wrong…' }` and is reported to Sentry as
an unexpected error, instead of `{ code: 'FORBIDDEN' }`.

## Proposed change (no contract signature change)

In `lib/permissions.ts`, `import { ActionError } from '@/lib/action'` and
`throw new ActionError('FORBIDDEN', ...)` in `assertCan`. `lib/action.ts` only imports
types and `lib/log`, so this adds no cycle; the module stays free of I/O. Alternatively,
`withAction` could also accept any error whose `name === 'ActionError'` and whose `code`
is a known `ErrorCode`.

## Affected tasks

Every action task that calls `assertCan` (LIB-01..07, LIST-*, SHR-*, ADM-*, …).

## Workaround in LIB-04

`features/themes/server.ts` uses a local `authorize(action)` helper: `requireUser()`,
then `can()`, throwing `new ActionError('FORBIDDEN', ...)`. It can switch to
`assertCan` once this CR lands.
