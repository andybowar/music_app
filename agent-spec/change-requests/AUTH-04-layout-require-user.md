# CR AUTH-04 · Wire `(app)` layout to `@/lib/auth`'s `requireUser`

**Status:** proposed. Depends on the approved direction in
`agent-spec/change-requests/UI-02-require-user.md` (option 1: "the swap belongs with the code
that owns auth"). AUTH-04 is now complete; this is the one-line follow-up that task.

## Problem

`agent-spec/tasks/UI-02.md` requires "`app/(app)/layout.tsx` calls `requireUser()` until AUTH-04
has merged." AUTH-04 now provides the contracted guard, but the layout's private stand-in
`requireUser` (in `app/(app)/layout.tsx`, owned by UI-02) still stands in. Without the swap,
pending/rejected users are not redirected to `/account-status` at the page level — AUTH-04's
acceptance criterion "Hitting /library as a pending or rejected user → /account-status" cannot be
demonstrated end-to-end.

## Proposed change

Add to AUTH-04's `touches`:

- `"app/(app)/layout.tsx"` — replace the layout's local stand-in `requireUser` with
  `import { requireUser } from '@/lib/auth'`, and handle the guard's throws on the page:
  `UNAUTHENTICATED` → `redirect('/login?next=…')`, `FORBIDDEN` → `redirect('/account-status')`
  (the latter requires AUTH-07's `/account-status` route; until it lands, fall back to `/login`).
  See `agent-spec/change-requests/UI-02-require-user.md` for the full rationale.

## Affects

- **AUTH-04**: one integration edit to `app/(app)/layout.tsx` (no change to `lib/auth.ts` or
  `middleware.ts`, both already correct and unit-tested).
- **UI-02**: its stand-in becomes obsolete; the CR should note that.
- **AUTH-07**: supplies `/account-status`, which the `FORBIDDEN` branch redirects to.

AUTH-04's `lib/auth.ts` + `middleware.ts` + unit tests are merged-ready independent of this CR; the
only thing gated is the layout swap, which belongs in another task's file.
