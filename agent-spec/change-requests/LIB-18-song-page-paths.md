# CR LIB-18 · Song page: gallery, route states and a lint-forced test edit

**Status:** proposed (LIB-18, 2026-11-01). Awaiting approval.

## Problem

LIB-18 `owns` only `app/(app)/songs/[id]/page.tsx` and `features/songs/ui/SongPage.tsx`, with no `touches`. Three things the Definition of Done needs fall outside those paths:

1. **Gallery page.** AGENTS.md §5 asks for a `/dev/<name>` page with fixtures for new components, and §3 says each UI task adds its own `app/dev/<name>/`. LIB-18 doesn't list one (same gap as `ADM-01-dev-gallery.md`).
2. **Route loading and error states.** AGENTS.md §5 and `contracts/ui.md` require loading (skeleton) and error states. The page handles the error case itself (it catches a failed `getSong`, reports it and renders `SongPageError`). It can't show a skeleton while the song loads without a route `loading.tsx`. A `<Suspense>` inside `page.tsx` would make `notFound()` run after streaming starts, so unknown songs would return 200 instead of 404, which breaks the LIB-18 acceptance criterion.
3. **Lint failure in a UI-07 test.** Once `app/(app)/songs/[id]/page.tsx` exists, `@next/next/no-html-link-for-pages` flags the literal `<a href="/songs/x/edit">` in `components/song/panels/ResourcesPanel.test.tsx` (line 170), because it now matches a real route. `pnpm lint` fails. No change inside LIB-18's paths avoids this, since the rule fires on that file because the route exists.

## Proposed diff

`agent-spec/tasks/LIB-18.md` frontmatter (then regenerate with `python3 agent-spec/scripts/gen_index.py`):

```diff
-owns: ["app/(app)/songs/[id]/page.tsx", "features/songs/ui/SongPage.tsx"]
-touches: []
+owns: ["app/(app)/songs/[id]/page.tsx", "app/(app)/songs/[id]/page.test.tsx", "features/songs/ui/SongPage.tsx", "features/songs/ui/SongPage.test.tsx", "app/dev/song-page/"]
+touches: ["components/song/panels/ResourcesPanel.test.tsx"]
```

- The LIB-18 PR already contains `app/dev/song-page/` (gallery with fixture songs, a fake signer and toggles for permissions and states) and the co-located tests.
- The `ResourcesPanel.test.tsx` edit is one line in the LIB-18 PR: `href="/songs/x/edit"` becomes `href="#add-files"`. The test still checks for an "Add files" link.
- **Follow-up (not in the LIB-18 PR):** add `app/(app)/songs/[id]/loading.tsx` rendering `SongPageSkeleton` and `app/(app)/songs/[id]/error.tsx`, which can reuse the `SongPageError` look with a `reset()` button. Both are already exported from `features/songs/ui/SongPage.tsx`. Note that a segment `loading.tsx`/`error.tsx` also wraps the nested `/songs/[id]/edit` route (LIB-17). If that's unwanted, LIB-17 can add its own boundaries in `edit/`.

## Affects

- **LIB-18**: extra owned paths and one touch. The follow-up adds two small route files.
- **UI-07** (done): a one-line test fixture change, with no behaviour change.
- **LIB-17**: only if the follow-up `loading.tsx`/`error.tsx` land at the `[id]` segment (see above).
