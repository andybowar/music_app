# CR PLAY-05 · Playlist gallery + e2e spec, and which recordings a playlist row offers

**Status:** approved by project owner 2026-11-03, with option **(a)**: `PlaylistView` gains optional `songs?` (and the `adapters?` seam), `contracts/ui.md` updated. Applied to `tasks/PLAY-05.md`; the gallery, e2e spec and `songs` wiring (PLAY-05 already touches `app/(app)/lists/[id]/page.tsx`) are a PLAY-05 follow-up.

## Problem

1. **Gallery and e2e paths.** PLAY-05's acceptance criterion is a Playwright test ("mp3 fixture: play → auto-advances to next track"), and AGENTS.md §5 asks for a `/dev/<name>` gallery page for new components. PLAY-05 owns only `features/player/ui/PlaylistView.tsx` and `features/player/ui/usePlayer.ts`, so it can't add `app/dev/playlist/` or `tests/e2e/playlist.spec.ts`. The ADM-01, PLAY-06 and LIB-17 CRs set the precedent.

   Until then, `features/player/ui/PlaylistView.test.tsx` and `usePlayer.test.ts` cover the behaviour with fake adapters: play all → auto-advance across MP3 and YouTube tracks, a song without audio shown but skipped, signed-URL fetch for stored MP3s (and skipping when it fails), recording choice with rollback, reorder/remove/rename/delete, read-only and empty states.

2. **Recordings outside the primary key.** `ListDetail.items[].resources` comes from `resolveItemDisplay` (LIST-04 semantics for setlists): resources of the *effective key* (primary key, since playlists have no override) plus unkeyed ones. Audio and YouTube links attached to a song's *other* keys are not in it, so the row's AudioPicker can't offer them, and an item whose `resourceId` points at one plays nothing (it shows "Choose a recording"). In the fixtures, "YouTube link 4" of *A Thousand Hallelujahs* (keyed to a non-primary key) is affected. REQ-LIST-05 says "per-song chosen audio item" with no key restriction.

## Proposed diff

### 1. Ownership (`agent-spec/tasks/PLAY-05.md`, then regenerate `INDEX.md` / `tasks.json`)

```diff
-owns: ["features/player/ui/PlaylistView.tsx", "features/player/ui/usePlayer.ts"]
+owns: ["features/player/ui/PlaylistView.tsx", "features/player/ui/usePlayer.ts", "app/dev/playlist/", "tests/e2e/playlist.spec.ts"]
```

A PLAY-05 follow-up then adds:

- `app/dev/playlist/page.tsx` (`if (!isDevGalleryEnabled()) notFound();`) and `PlaylistGallery.tsx`: `PlaylistView` over the *Background 1* fixture, editable and read-only, plus an empty playlist. Server actions are faked as in the other galleries. The audio items are two short silent MP3s embedded as `data:audio/mpeg;base64,…` URLs (a few hundred bytes each, no binary file committed), so the real MP3 adapter plays them on any preview.
- `tests/e2e/playlist.spec.ts` against the gallery (skips where it 404s, like `responsive-panel.spec.ts`): press Play all → track 1 of 2 is playing → after it ends, the bar shows track 2 of 2 playing → then "Finished". Run with Chromium's `--autoplay-policy=no-user-gesture-required` only if the click-started playback is not enough.

### 2. Playlist audio choices (pick one; affects LIST-07 or LIST-01)

- **(a, preferred)** `contracts/ui.md` `PlaylistView`: `{ list: ListDetail; canEdit: boolean; songs?: SongDetail[] }`, the same optional prop SetlistView got in CR LIST-07-setlist-extras. The list route (LIST-07, a one-line touch) passes `getSongs(...)` for playlists too, and PlaylistView offers every audio/video resource of the song, falling back to `resolved.resources` when `songs` is absent.
- **(b)** `getList` (LIST-01) fills `resources` with all of the song's resources when `list.type === 'playlist'`. No prop change, but it bends `ResolvedItem.resources`' documented meaning.

## Contract note (no diff needed)

`PlaylistView` also takes an optional `adapters?: PlayerAdapterFactories` (from `features/player/ui/usePlayer.ts`), a seam for tests and the gallery to swap in fake players. It defaults to the real MP3 and YouTube adapters, so `{ list, canEdit }` callers are unaffected.

## Affects

- **PLAY-05**: two extra owned paths; option (a) adds an optional prop.
- **LIST-07** (option a): pass `songs` to `PlaylistView` in `app/(app)/lists/[id]/page.tsx`.
- **LIST-01** (option b): `getList` playlist branch.
- No migrations, no shared types.
