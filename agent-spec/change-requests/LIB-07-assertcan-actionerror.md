# CR LIB-07: `assertCan` failures surface as INTERNAL, not FORBIDDEN

**Status:** proposed

## Problem

`lib/permissions.ts` (AUTH-05) `assertCan` throws a plain `Error` whose `name` is `'ActionError'` and that has `code: 'FORBIDDEN'`. Its comment says this is so `withAction` can map it. But `lib/action.ts` (DB-06) `withAction` checks `error instanceof ActionError`, so the error falls through to the unknown-error branch. It is reported to Sentry and returned as `{ code: 'INTERNAL', message: 'Something went wrong…' }`. Every server action that follows the contract (`requireUser` → `assertCan` → …) returns INTERNAL instead of FORBIDDEN when permission is denied.

## Proposed change (no contract signature change)

In `lib/permissions.ts`, now that `lib/action.ts` exists, throw the real class:

```ts
import { ActionError } from '@/lib/action';
// …
throw new ActionError('FORBIDDEN', `You do not have permission to do this (${action}).`);
```

`lib/action.ts` imports `next/navigation` and `@/lib/log`. If that is unwanted in the pure permissions module, which RLS parity tests use, use the alternative instead: make `withAction` also accept any error with `name === 'ActionError'` and a string `code`.

## Affected

- AUTH-05 (`lib/permissions.ts`) or DB-06 (`lib/action.ts`), whichever approach is chosen.
- Every action task that calls `assertCan`. LIB-07 works around it locally with a small `authorize()` wrapper in `features/resources/server/links.ts` that rethrows a real `ActionError`. That wrapper can be removed once this CR lands.
