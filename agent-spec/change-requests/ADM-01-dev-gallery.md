# CR ADM-01 · `/dev/admin-users` gallery page

**Status:** approved (PM, 2026-10-30).

## Problem

AGENTS.md §5 asks every UI task for a `/dev/<name>` gallery page with fixtures, and §3 says each UI
task adds its own `app/dev/<name>/`. ADM-01's `owns` doesn't list one, so the PR can't add it
without editing outside its paths.

## Proposed diff

Add `"app/dev/admin-users/"` to ADM-01's `owns` (and regenerate `INDEX.md` / `tasks.json`). A
follow-up PR then adds `app/dev/admin-users/page.tsx` rendering `UsersAdmin`
(`features/admin/ui/users/UsersAdmin.tsx`) from `fixtures/users.json` and `fixtures/branches.json`
with stubbed `onInvite` / `onUpdate` / `onApprove` / `onReject` handlers: pending, rejected,
disabled and empty states, plus `lib/devGallery.ts`'s `isDevGalleryEnabled()` guard.

The component already takes plain data and action props, so no change to it is needed.

## Affects

- **ADM-01**: one extra owned path; the gallery page lands in a small follow-up.
- No other task owns `app/dev/admin-users/`.
