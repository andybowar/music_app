# CR SRCH-08 · ResultsList: optional `error`, `onRetry`, `onClearFilters`, `className`

**Status:** proposed.

## Problem

SRCH-08 has to deliver an empty state with a "clear filters" action, and AGENTS.md §5 requires an error state. The `contracts/ui.md` row gives `ResultsList` only `{ result; renderRow; onLoadMore; loading }`, which has no way to clear filters or report a failed fetch.

## Proposed change

`agent-spec/contracts/ui.md`, ResultsList row:

```diff
-| `ResultsList` | `features/search/ui/ResultsList.tsx` | `{ result: SearchResult; renderRow(s: SongSummary): ReactNode; onLoadMore(): void; loading: boolean }` | SRCH-08 |
+| `ResultsList` | `features/search/ui/ResultsList.tsx` | `{ result: SearchResult; renderRow(s: SongSummary): ReactNode; onLoadMore(): void; loading: boolean; error?: string \| null; onRetry?(): void; onClearFilters?(): void; className?: string }` | SRCH-08 |
```

All new props are optional, so callers written against the current row still compile.

- `error`: when there are no rows, it replaces the list. When rows are already loaded, it shows under them and pauses infinite scroll.
- `onRetry`: the "Try again" button. If it's omitted and rows are loaded, the button calls `onLoadMore`.
- `onClearFilters`: the "Clear filters" button in the empty state. The button is hidden when this is omitted. SRCH-09 should pass `clear` from `useSearchState`.

## Affects

- SRCH-08 (this task): already implemented this way.
- SRCH-09 (consumer): pass `onClearFilters={clear}` and `error` / `onRetry` from its fetch state.
