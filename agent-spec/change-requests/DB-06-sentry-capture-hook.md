# CR DB-06 · Document the `withAction` error-capture hook for OPS-02

**Status:** approved by project owner 2026-10-30. `contracts/api.md` updated. OPS-02 merged without installing the hook; installing it in `instrumentation.ts` is a follow-up for the lead dev.

## Problem

`withAction` (`lib/action.ts`) reports unknown errors through a pluggable hook so `lib/action.ts`
doesn't depend on `@sentry/*`. The hook isn't in `contracts/api.md`, so OPS-02 (Sentry + structured
logging) has no way to know it must install it. Until something does, unknown action errors are
only logged with `console.error`.

## Proposed diff

`contracts/api.md`, Core libs, `lib/action.ts` row:

```diff
-| `lib/action.ts` | `class ActionError(code, message, fieldErrors?)`, `withAction<A,T>(fn): (...a:A)=>Promise<ActionResult<T>>` | DB-06 |
+| `lib/action.ts` | `class ActionError(code, message, fieldErrors?)`, `withAction<A,T>(fn): (...a:A)=>Promise<ActionResult<T>>`, `setSentryCapture(fn: ((error, context?) => void) \| null)` (default: `console.error`) | DB-06 |
```

`tasks/OPS-02.md`, Deliverables, add:

```diff
+- [ ] Call `setSentryCapture((e, ctx) => Sentry.captureException(e, { extra: ctx }))` from `instrumentation.ts` (server runtime only)
```

## Affects

- OPS-02 (installs the hook in `instrumentation.ts`, which it already owns).
- No change for other tasks; `withAction` behaves the same.
