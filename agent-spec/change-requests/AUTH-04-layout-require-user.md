# CR AUTH-04 · Wire `(app)` layout to `@/lib/auth`'s `requireUser`

**Status:** proposed. Depends on the approved direction in
`agent-spec/change-requests/UI-02-require-user.md` (option 1: "the swap belongs with the code
that owns auth"). AUTH-04 is now complete; this is the one-line follow-up that task.

## Problem

`agent-spec/tasks/UI-02.md` requires "`app/(app)/layout.tsx` calls `requireUser()` until AUTH-04
has merged." AUTH-04 now provides the contracted guard, but the layout's private stand-in
`requireUser` (in `app/(app)/layout.tsx`, owned by UI-02) still stands in.

`middleware.ts` already redirects signed-out, disabled, and pending/rejected users on `(app)`
routes, so this is defence in depth rather than a gap: the stand-in ignores `accessStatus`, and
it would be the only check left if the middleware's `users` lookup fails (the middleware then
defers to the page guard).

## Proposed change

Add to AUTH-04's `touches`:

- `"app/(app)/layout.tsx"` — replace the layout's local stand-in `requireUser` with
  `import { requireUser } from '@/lib/auth'`, and handle the guard's throws on the page:
  `UNAUTHENTICATED` → `redirect('/login?next=…')`, `FORBIDDEN` → `redirect('/account-status')`
  (the latter requires AUTH-07's `/account-status` route; until it lands, fall back to `/login`).
  See `agent-spec/change-requests/UI-02-require-user.md` for the full rationale.

## Affects

- **AUTH-04**: one integration edit to `app/(app)/layout.tsx` (no change to `lib/auth.ts` or
  `middleware.ts`).
- **UI-02**: its stand-in becomes obsolete; the CR should note that.
- **AUTH-07**: supplies `/account-status`, which the `FORBIDDEN` branch redirects to.

AUTH-04's deliverables and acceptance criteria are met without this CR; the layout swap belongs
in another task's file.
