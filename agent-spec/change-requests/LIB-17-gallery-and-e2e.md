# CR LIB-17 · `/dev/song-form` gallery page and a song-form e2e spec

**Status:** approved by project owner 2026-11-01. Applied to `tasks/LIB-17.md`; the gallery and e2e spec are a LIB-17 follow-up.

## Problem

1. AGENTS.md §5 asks for a `/dev/<name>` gallery page with fixtures for each new component, and §3 says each UI task adds its own `app/dev/<name>/`. LIB-17's `owns` doesn't include one, so `SongForm` can't get a gallery without editing outside its paths. The ADM-01 and PLAY-06 CRs set this precedent.
2. LIB-17's acceptance criteria ask for Playwright checks: a contributor creates "1000 Hallelujahs" with 3 keys, themes, a PDF and a YouTube link, and the data is all there after a reload; a member visiting `/songs/new` gets the 403 page. `tests/e2e/` isn't owned, so the spec can't be committed. Local Supabase/Docker is also broken right now, so the spec can't be run.

Until then, `features/songs/ui/SongForm.test.tsx` covers what a gallery would show: new and edit forms, validation, server field errors on their tab, a partial create, the leave guard, and the forbidden and skeleton states. `features/songs/ui/form/toInput.test.ts` covers the save orchestration.

## Proposed diff

`agent-spec/tasks/LIB-17.md` frontmatter (then regenerate `INDEX.md` / `tasks.json`):

```diff
-owns: ["app/(app)/songs/new/", "app/(app)/songs/[id]/edit/", "features/songs/ui/SongForm.tsx", "features/songs/ui/form/toInput.ts"]
+owns: ["app/(app)/songs/new/", "app/(app)/songs/[id]/edit/", "features/songs/ui/SongForm.tsx", "features/songs/ui/form/toInput.ts", "app/dev/song-form/", "tests/e2e/song-form.spec.ts"]
```

A LIB-17 follow-up then adds:

- `app/dev/song-form/page.tsx` (`if (!isDevGalleryEnabled()) notFound();`) and `SongFormGallery.tsx`, which render `SongForm` new and edit (`thousandHallelujahs`) with fake actions. They reuse the fakes in `app/dev/form-basic|form-themes|form-usage|form-resources/` by import only, without editing them. Modes: success, field errors, partial create failure, plus the forbidden and skeleton states.
- `tests/e2e/song-form.spec.ts` for the two acceptance scenarios, run against a seeded local stack.

## Affects

- **LIB-17**: two extra owned paths. No other task owns them.
- No contract changes.
