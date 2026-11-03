# CR LIST-11 · Full-screen set player, and lyrics in place on the setlist

**Status:** proposed (2026-11-03). Requested by the project owner; written by the lead agent.

## Problem

A musician leading worship has no way to play a set. From a setlist (`/lists/[id]`, LIST-07) they can open each song's resources panel and its chord chart PDF, but:

1. **No next or previous song.** Each song means: close the viewer, tap the next row, open the panel, open the chart.
2. **Lyrics take you out of the setlist.** "Show lyrics" in the resources panel goes to the song page (`SetlistView.tsx`, `onShowLyrics={() => router.push(songHref(...))}`), and the musician then has to go back to reach the next song.
3. **Not built for a music stand.** Nothing goes full screen, keeps the screen awake, or makes the lyrics bigger.

The SPEC has no requirement for this, and the contracts have no component for it.

## Proposed changes

### 1. SPEC: new requirement (§2.6 Lists)

```diff
 - **REQ-LIST-08** Setlists are readable by all members (supports "what other branches are using"); playlists are private to their owner unless shared.
+- **REQ-LIST-09** Play a setlist: from a setlist, Start opens a full-screen view of one song at a time, in setlist order. Each song shows its lyrics in arrangement order, the setlist's key, BPM and first chords, and opens that key's chord charts. Next and previous work by button, swipe, arrow and Page Up/Down keys (page-turner pedals). The screen stays awake while it's open, and it works offline for setlists the user has opened (REQ-NF-02).
```

### 2. `contracts/ui.md`: new row

```diff
+| `SetPlayer` | `features/lists/ui/SetPlayer.tsx` | `{ title: string; items: ResolvedItem[]; songs?: SongDetail[]; index: number; onIndexChange(index: number): void; onOpenResource(r: Resource): void; onClose(): void }` (`index` is 0-based; `songs` as in `SetlistView`; `onOpenResource` opens PDFs over the player) | LIST-11 |
```

### 3. Touches to LIST-07's `SetlistView` (`features/lists/ui/SetlistView.tsx` and its test)

- A **Start** button in the setlist header for every reader, hidden on an empty list. It mounts `SetPlayer` and keeps the open song in the URL as `?play=<n>`, so reload, Back and the service worker's offline copy (cache key without the query) all reopen it.
- "Show lyrics" in the resources panel opens `LyricsViewer` inside the panel when the song's details are loaded, instead of going to the song page. Without details it still goes to the song page. This changes LIST-07's behaviour, which is why it's in this CR and not just a touch.

`SetlistViewProps` doesn't change.

## Not changed

- No new route, server code, migration or service-worker change. The player reads the `ResolvedItem`s and `songs` the route already loads, and opens PDFs through the existing `getSignedResourceUrl` action, which the service worker already caches.
- **Out of scope:** chords written over the lyrics (needs songs stored as ChordPro text; TODO #2) and one device moving everyone else's screen. Both are recorded in `TODO.md` #10.

## Affects

- **LIST-11** (new task): implements all of it. It's `blocked` until this CR is approved.
- **LIST-07** (done): `SetlistView` gains the Start button and lyrics in place, through LIST-11's touches.
- **H-04** (done): its axe scan picks up `/dev/set-player` automatically. Nothing to change.

## On approval

Apply items 1 and 2, then set `tasks/LIST-11.md` to `status: todo` and remove its "Blocked until" paragraph.
