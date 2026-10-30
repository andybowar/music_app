# CR SRCH-07 · SortControl: `hasQuery` prop, `onChange` types, `/dev/sort-control` gallery

**Status:** approved by project owner 2026-10-30. `contracts/ui.md` and `tasks/SRCH-07.md` updated; the gallery page is still to be written. SRCH-07 is implemented to the proposed contract below, so no code change is needed if this is approved.

## Problem

1. **"Relevance" needs to know whether there's a query.** The SRCH-07 deliverable says `"Relevance" shown when q present and no sort`, but the contract in `contracts/ui.md` gives `SortControl` only `{ sort?: Sort; dir?: 'asc'|'desc'; onChange(sort, dir): void }`. The component can't tell whether `q` is set. It could read `useSearchState()` itself, but that would tie a presentational control to the URL and the router.
2. **`onChange` parameter types are unspecified.** Picking "Relevance" has to clear the sort so the server falls back to `ts_rank` (SRCH-01), so `sort` (and `dir`) can be `undefined`.
3. **No gallery path.** AGENTS.md §5 wants a `/dev/<name>` page for new components, but SRCH-07 owns only `features/search/ui/SortControl.tsx`.

## Proposed change

`agent-spec/contracts/ui.md`, SortControl row:

```diff
-| `SortControl` | `features/search/ui/SortControl.tsx` | `{ sort?: Sort; dir?: 'asc'\|'desc'; onChange(sort, dir): void }` | SRCH-07 |
+| `SortControl` | `features/search/ui/SortControl.tsx` | `{ sort?: Sort; dir?: 'asc'\|'desc'; hasQuery?: boolean; className?: string; onChange(sort: Sort \| undefined, dir: 'asc'\|'desc' \| undefined): void }` | SRCH-07 |
```

The new props are optional, so callers written against the old row still compile. SRCH-09 should pass `hasQuery={Boolean(params.q)}` and wire it as `onChange={(sort, dir) => setParams({ sort, dir })}`. `setParams` already treats `undefined` as "remove the key".

Behaviour as implemented:

- Options, in order: `Relevance` (only when `hasQuery`), `Date added`, `A–Z`, `Primary key`, `Energy`, `Branch use`.
- When `sort` is unset, the select shows `Relevance` if `hasQuery`, otherwise `Date added`, which matches the `SearchParams.sort` default.
- Choosing a sort emits that sort with its starting direction: `date` → `desc` (newest first), every other sort → `asc`. Choosing `Relevance` emits `(undefined, undefined)`. Re-choosing the current sort emits nothing.
- The direction button flips `asc`/`desc` and keeps the sort. It's disabled under relevance. When `dir` is unset, it starts from the sort's default direction.

**Gallery.** Add `"app/dev/sort-control/"` to SRCH-07's `owns` (in the task frontmatter and `tasks.json`), or fold the control into SRCH-09's page. The page would render four states: unset/no query, relevance (query and no sort), `alpha asc`, and `date desc` inside a 360px-wide frame.

## Affects

- SRCH-07 (this task): already matches the proposed row.
- SRCH-09 (consumer): pass `hasQuery`.
