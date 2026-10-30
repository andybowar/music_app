# CR UI-02 · Layout needs `requireUser()` before AUTH-04 has merged

**Status:** approved by project owner 2026-10-30 (option 1). The swap itself is covered by `AUTH-04-layout-require-user.md`.

## Problem

`tasks/UI-02.md` requires "Layout calls `requireUser()`", and `contracts/api.md` puts
`requireUser()` in `lib/auth.ts` (AUTH-04). UI-02 does not depend on AUTH-04, and AUTH-04 is
still `todo`, so `@/lib/auth` does not exist on main. Importing it would break `typecheck` and
`build`.

## Workaround in the UI-02 PR

`app/(app)/layout.tsx` defines a private stand-in `requireUser(): Promise<AppUser>` with the
contracted behaviour: Supabase `auth.getUser()`, then the `users` row via `lib/db`; no session, no
row, or `disabled_at` set → `redirect('/login')`. It is clearly marked TEMPORARY.

## Proposed diff

Either:

1. Add `"app/(app)/layout.tsx"` to AUTH-04's `touches`, with the note "replace the layout's local
   `requireUser` stand-in with `import { requireUser } from '@/lib/auth'` and handle
   UNAUTHENTICATED (redirect to `/login?next=…`, or let middleware do it)"; or
2. Have LIST-09 (which already touches the layout) make that swap. LIST-09 already depends on
   AUTH-04 transitively (LIST-09 → LIST-02 → AUTH-04), so no dependency change is needed.

Option 1 is preferred: the swap belongs with the code that owns auth.

## Affects

- **AUTH-04**: one-line integration edit to `app/(app)/layout.tsx`.
- **UI-02**: none further.
