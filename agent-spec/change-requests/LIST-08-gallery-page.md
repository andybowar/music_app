# CR LIST-08 · Gallery page for ListIndex

**Status:** approved by project owner 2026-11-03. Applied to `tasks/LIST-08.md`; the gallery page is a LIST-08 follow-up.

## Problem

AGENTS.md §5 asks for a `/dev/<name>` gallery page for new components. LIST-08 owns only `app/(app)/lists/page.tsx` and `features/lists/ui/ListIndex.tsx`, with no `app/dev/` path.

## What LIST-08 did instead

- `features/lists/ui/ListIndex.test.tsx` renders every state from `fixtures/` at the component level: setlist tabs (Mine / My branch / All branches), playlist (no tabs), upcoming / past / no-date groups, current list, set-as-current success and failure, loading skeleton, error with retry, the empty state for each scope, and the create flow.
- The real page `/lists?type=setlist|playlist` shows the live states against seeded data.

## Proposed change

```diff
-owns: ["app/(app)/lists/page.tsx", "features/lists/ui/ListIndex.tsx"]
+owns: ["app/(app)/lists/page.tsx", "features/lists/ui/ListIndex.tsx", "app/dev/list-index/"]
```

A follow-up adds `app/dev/list-index/page.tsx` (guarded by `isDevGalleryEnabled()`), rendering `ListIndex` with fixture lists and stubbed `onSetCurrent` / `onCreate` in each state above.

**Affects:** LIST-08 (`tasks/LIST-08.md`, `tasks.json`).
