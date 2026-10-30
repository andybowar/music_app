# CR LIB-02: `assertCan` should throw a real `ActionError`

**Status:** proposed

## Problem
`assertCan` (lib/permissions.ts, AUTH-05) throws a plain `Error` with `name = 'ActionError'`
and `code = 'FORBIDDEN'`, because `lib/action.ts` didn't exist when it was written. `withAction`
only recognises `instanceof ActionError`. So a permission denial inside any action becomes
`{ code: 'INTERNAL', message: 'Something went wrong…' }` and is reported to Sentry as an
unexpected error. The caller should get `FORBIDDEN`.

## Proposed change
In `lib/permissions.ts`, `import { ActionError } from '@/lib/action'` and
`throw new ActionError('FORBIDDEN', …)`. The contract signature stays the same. If importing
`lib/action` from the pure permissions module is unwanted (it pulls `next/navigation` and
`lib/log`), have `withAction` also map any error whose `name === 'ActionError'` and that
has a valid `code`.

## Affected tasks
Every action that calls `assertCan`: LIB-01..07, LIST-*, SHR-*, admin tasks. Until this
lands, LIB-02 converts the error locally (`assertCanWrite` in
`features/songs/server/keys.ts`). That wrapper can be removed afterwards.
