# CR AUTH-04 · Wire `(app)` layout to `@/lib/auth`'s `requireUser`

**Status:** approved by project owner 2026-11-01. Applied to `tasks/AUTH-04.md` (touches `app/(app)/layout.tsx`); the layout edit is an AUTH-04 follow-up.

## Problem

`agent-spec/tasks/UI-02.md` requires "`app/(app)/layout.tsx` calls `requireUser()` until AUTH-04
has merged." AUTH-04 now provides the contracted guard, but the layout's private stand-in
`requireUser` (in `app/(app)/layout.tsx`, owned by UI-02) still stands in.

`middleware.ts` already redirects signed-out, disabled, and pending/rejected users on every
non-public route, and fails closed (503) when Auth or the `users` lookup errors, so this is defence
in depth rather than a gap: the stand-in ignores `accessStatus`.

## Proposed change

Add to AUTH-04's `touches`:

- `"app/(app)/layout.tsx"` — replace the layout's local stand-in `requireUser` with
  `import { requirePageUser } from '@/lib/auth'`. `requirePageUser` already redirects on the
  page: no usable session → `/login`, pending/rejected → `/account-status` (AUTH-07's route).
  See `agent-spec/change-requests/UI-02-require-user.md` for the full rationale.

## Affects

- **AUTH-04**: one integration edit to `app/(app)/layout.tsx` (no change to `lib/auth.ts` or
  `middleware.ts`).
- **UI-02**: its stand-in becomes obsolete; the CR should note that.
- **AUTH-07**: supplies `/account-status`, which the `FORBIDDEN` branch redirects to.

AUTH-04's deliverables and acceptance criteria are met without this CR; the layout swap belongs
in another task's file.
