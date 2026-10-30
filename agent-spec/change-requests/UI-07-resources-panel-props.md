# CR UI-07 · ResourcesPanel: `hasLyrics` and `addFilesSlot` props

**Status:** approved by project owner 2026-10-30. `contracts/ui.md` updated in the same commit; UI-07 already implements it.

## Problem

`contracts/ui.md` gives `ResourcesPanel` `{ resources: Resource[]; keys: SongKey[]; onOpen(r: Resource): void; onShowLyrics(): void }`. Two parts of UI-07 can't be built from those props alone:

1. **"Add files" link for contributors.** The UI-07 acceptance criterion says a song with no files shows "No files yet" and, for contributors, an "Add files" link slot. The panel is props-only and doesn't know the viewer's role or the edit route, so the caller has to pass the link in.
2. **"Empty groups hidden" for Lyrics.** The panel gets no lyrics, so it can't tell whether the Lyrics group is empty. Without a flag it would always offer "Show lyrics", even for a song with no lyrics.

## Proposed change

`agent-spec/contracts/ui.md`, ResourcesPanel row:

```diff
-| `ResourcesPanel` | `components/song/panels/ResourcesPanel.tsx` | `{ resources: Resource[]; keys: SongKey[]; onOpen(r: Resource): void; onShowLyrics(): void }` groups: Lyrics, Sheet Music (by key), Audio (by key), Projection | UI-07 |
+| `ResourcesPanel` | `components/song/panels/ResourcesPanel.tsx` | `{ resources: Resource[]; keys: SongKey[]; onOpen(r: Resource): void; onShowLyrics(): void; hasLyrics?: boolean; addFilesSlot?: ReactNode }` groups: Lyrics, Sheet Music (by key), Audio (by key), Projection | UI-07 |
```

Both props are optional, so callers written against the old row still compile and behave as before (Lyrics shown, no slot).

- `hasLyrics` (default `true`): `false` hides the Lyrics group.
- `addFilesSlot`: rendered under the files (and under "No files yet" when there are none). The caller passes it only when `can(user, 'resource:write')`, e.g. `<Link href={`/songs/${id}/edit`}>Add files</Link>`.

## Affects

- UI-07 (this task): already matches the proposed row.
- LIB-18 (song page) and SRCH-09 / LIST-07 (row panels): pass `hasLyrics` from `SongDetail.lyrics` and the add-files link for contributors. Without them the panel still works, with Lyrics always shown and no link.
