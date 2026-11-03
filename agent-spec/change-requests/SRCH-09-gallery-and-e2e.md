# CR SRCH-09 · Library gallery page and e2e spec

**Status:** approved by project owner 2026-11-03. Applied to `tasks/SRCH-09.md`; the gallery page and e2e spec are a SRCH-09 follow-up.

## Problem

1. AGENTS.md §5 asks for a `/dev/<name>` gallery page with fixtures for new components, and §3 says each UI task adds its own `app/dev/<name>/`. SRCH-09 owns only `app/(app)/library/`, `features/search/ui/LibraryView.tsx` and `features/search/ui/RowPanels.tsx`, so `LibraryView` has no gallery. The ADM-01, LIB-17 and LIB-18 CRs set this precedent.
2. SRCH-09's acceptance criteria ask for Playwright checks: search theme "redemption", open Resources, open a chord chart PDF; Back restores the previous search. `tests/e2e/` isn't owned, and local Supabase isn't available to run a seeded spec.
3. Unit tests for `LibraryView.tsx` and `RowPanels.tsx` can't sit next to them (`features/search/ui/*.test.tsx` isn't owned). In the SRCH-09 PR they live in the owned folder instead: `app/(app)/library/LibraryView.test.tsx` and `RowPanels.test.tsx`. These tests already cover the PDF flow (Resources → chord chart → viewer) against fixtures, with fake actions.

## Proposed diff

`agent-spec/tasks/SRCH-09.md` frontmatter (then run `python3 agent-spec/scripts/gen_index.py`):

```diff
-owns: ["app/(app)/library/", "features/search/ui/LibraryView.tsx", "features/search/ui/RowPanels.tsx"]
+owns: ["app/(app)/library/", "features/search/ui/LibraryView.tsx", "features/search/ui/RowPanels.tsx", "app/dev/library/", "tests/e2e/library.spec.ts"]
```

A SRCH-09 follow-up then adds:

- `app/dev/library/page.tsx` (`if (!isDevGalleryEnabled()) notFound();`), which renders `LibraryView` with fixture results and fake `searchMore` / `loadSong` / `getSignedResourceUrl` (states: default, empty, server error, facets error, did-you-mean).
- `tests/e2e/library.spec.ts` covering both acceptance scenarios, run against a seeded stack.

## Affects

- **SRCH-09**: two extra owned paths. No other task owns them.
- No contract changes.
