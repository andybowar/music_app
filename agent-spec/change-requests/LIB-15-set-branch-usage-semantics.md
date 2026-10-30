# CR LIB-15 · `setBranchUsage` semantics for manual vs derived rows

**Status:** approved by project owner 2026-10-30. `contracts/api.md` and `contracts/ui.md` updated. LIB-05 implements the semantics.

## Problem

`contracts/api.md` lists `setBranchUsage(songId, entries)` (LIB-05) but doesn't say what happens
to branches that are not in `entries`, or to rows with `source = 'derived'` (REQ-BR-02, SPEC §6
"manual overrides derived"). `SongFormValue['usage']` is `{ branchId, level }[]` with no `source`,
so the form can't send derived rows back without turning them into manual ones.

## What LIB-15 assumes (and ships)

- The form value `usage` holds **manual entries only**. `usageFromSong(song)` (exported from
  `features/songs/ui/form/UsageSection.tsx`) builds it from `SongDetail.usage`, dropping derived rows.
- `UsageSection` takes the stored `SongDetail.usage` as a separate `saved` prop to show derived
  values (with a "Derived" badge) for branches that have no manual entry.
- Clearing a branch removes its entry: the row falls back to its derived value, or to `none`.

## Proposed contract diff (`contracts/api.md`, LIB-05 row)

```diff
-| `features/songs/server/usage.ts` | `setBranchUsage(songId, entries)` | `ActionResult<void>` | usage:write | LIB-05 |
+| `features/songs/server/usage.ts` | `setBranchUsage(songId, entries: UsageInput)` (replace-all of **manual** rows: each entry is upserted with `source='manual'`; manual rows not in `entries` are deleted; derived rows are kept unless an entry overrides them) | `ActionResult<void>` | usage:write | LIB-05 |
```

`fieldErrors` keys index into `entries` (`usage.<i>.level` or `<i>.level`); `UsageSection` maps
either form back to the entry's branch row.

## Affects

- **LIB-05**: implement the semantics above (or tell LIB-15/LIB-17 what differs).
- **LIB-17**: initialise the form with `usageFromSong(song)`, pass `saved={song.usage}`, and send
  `value.usage` to `setBranchUsage` as-is.
- **BR-03**: the derived job must not overwrite rows with `source = 'manual'`.
