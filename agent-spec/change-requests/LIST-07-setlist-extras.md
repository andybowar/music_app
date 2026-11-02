# CR LIST-07 · `SetlistView` song details prop, a gallery page and the setlist e2e spec

**Status:** proposed.

## Problem

1. **Panels and override keys need song details.** `SetlistView` is `{ list: ListDetail; canEdit: boolean }`, but `ListDetail.items` only carry `SongSummary` plus resolved values. The row panels need more (`KeyPanel` needs `SongKey[]`, `ComposerPanel` needs `Composer[]`, `UsagePanel` needs usage, `ReminderPanel` needs first lines), and so does `ItemOverrideEditor`'s `keys: SongKey[]`. The view is props-only, so it can't fetch them.
2. **No gallery path.** AGENTS.md §5 asks for a `/dev/<name>` page for new components. LIST-07 owns no `app/dev/` path (same situation as the ADM-01, AUTH-07 and LIB-17 CRs).
3. **No e2e path.** The acceptance criterion asks for a Playwright check ("reorder persists; override to E on a song lacking E shows X and the upload prompt"). `tests/e2e/` isn't owned, and the local Supabase stack wasn't available to run it.

## Proposed diff

`contracts/ui.md` (additive, optional):

```diff
-| `SetlistView` | `features/lists/ui/SetlistView.tsx` | `{ list: ListDetail; canEdit: boolean }` | LIST-07 |
+| `SetlistView` | `features/lists/ui/SetlistView.tsx` | `{ list: ListDetail; canEdit: boolean; songs?: SongDetail[] }` (`songs`: details of the list's songs, from `getSongs`, for row panels and override keys) | LIST-07 |
```

`agent-spec/tasks/LIST-07.md` frontmatter (then regenerate `INDEX.md` / `tasks.json`):

```diff
-owns: ["app/(app)/lists/[id]/", "features/lists/ui/SetlistView.tsx", "features/lists/ui/ItemOverrideEditor.tsx"]
+owns: ["app/(app)/lists/[id]/", "features/lists/ui/SetlistView.tsx", "features/lists/ui/ItemOverrideEditor.tsx", "app/dev/setlist/", "tests/e2e/setlist.spec.ts"]
```

## What LIST-07 ships meanwhile

- `songs?` is implemented as optional. The route passes `getSongs(songIds)`. Without it (or if loading the details fails), row taps open the song page and the override editor offers every key, using the server-resolved chords for the saved key. If the CR is rejected, the prop is removed and the route stops loading details.
- `SetlistView.test.tsx` and `ItemOverrideEditor.test.tsx` cover what a gallery would show: populated, empty, read-only and skeleton states, reorder (Move up / Move down, with rollback), remove, rename, delete, and the override-to-E case (X chords plus "Upload files for E").
- A follow-up would add `app/dev/setlist/page.tsx` (`if (!isDevGalleryEnabled()) notFound();`) rendering `SetlistView` with `fixtures` list "BG 4/19/26" (editable, read-only, empty) and `ItemOverrideEditor` alone. The view imports the list server actions directly, so the gallery page needs a fixture-backed stand-in for them. It would also add `tests/e2e/setlist.spec.ts` for the two acceptance scenarios against a seeded local stack.

## Affects

- **LIST-07**: one optional prop, two extra owned paths. No other task owns them.
- **PLAY-05 / SHR-04**: none. `songs` is optional, so `PlaylistView` and share wiring are unchanged.
