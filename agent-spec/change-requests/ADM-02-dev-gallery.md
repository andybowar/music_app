# CR ADM-02 · `/dev/admin-branches` gallery page

**Status:** approved by project owner 2026-11-01. Applied to `tasks/ADM-02.md`; the gallery page is an ADM-02 follow-up.

## Problem

AGENTS.md §5 asks every UI task for a `/dev/<name>` gallery page with fixtures, and §3 says each UI
task adds its own `app/dev/<name>/`. ADM-02's `owns` doesn't list one, so the PR can't add it
without editing outside its paths. Same situation as `ADM-01-dev-gallery.md` (approved).

## Proposed diff

Add `"app/dev/admin-branches/"` to ADM-02's `owns` (and regenerate `INDEX.md` / `tasks.json`). A
follow-up PR then adds `app/dev/admin-branches/page.tsx` rendering `BranchesAdmin`
(`features/admin/ui/branches/BranchesAdmin.tsx`) from `fixtures/branches.json` with stubbed
`onSave` / `onDelete` handlers: in-use and unused branches, a code-uniqueness error, and the empty
state, behind `lib/devGallery.ts`'s `isDevGalleryEnabled()` guard.

The component already takes plain data and action props, so no change to it is needed.

## Affects

- **ADM-02**: one extra owned path; the gallery page lands in a small follow-up.
- No other task owns `app/dev/admin-branches/`.
