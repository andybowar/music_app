---
id: LIST-11
title: "Play a setlist: full-screen worship mode"
phase: 5
wave: 11
stream: frontend
size: M
status: done
human_required: false
depends_on: ["LIST-07", "UI-07", "UI-08", "H-01", "LIB-22"]
blocks: ["LIB-23"]
owns: ["features/lists/ui/player/", "app/dev/set-player/", "tests/e2e/set-player.spec.ts"]
touches: ["features/lists/ui/SetlistView.tsx", "features/lists/ui/SetlistView.test.tsx", "components/song/LyricsViewer.tsx", "components/song/ChordLyrics.tsx", "docs/user-guide.md", "agent-spec/SPEC.md", "agent-spec/contracts/ui.md", "agent-spec/change-requests/LIST-11-set-player.md"]
requirements: ["REQ-LIST-09", "REQ-ROW-03", "REQ-NF-02", "REQ-NF-03"]
---

# LIST-11 · Play a setlist: full-screen worship mode


**Goal.** A musician opens a setlist and taps **Start**. Each song in turn fills the screen with its lyrics in arrangement order, the setlist's key, BPM and first chords, and a one-tap way into that key's chord chart. They move between songs with a swipe, the arrow keys or a Bluetooth page-turner pedal. The screen stays awake, and it works offline for setlists they've opened before. Requested by the project owner on 2026-11-03.


## Read first
- `agent-spec/AGENTS.md`
- `agent-spec/SPEC.md` (REQ-LIST-04, REQ-ROW-03/04, REQ-NF-01..03)
- `agent-spec/contracts/ui.md` (`SetlistView`, `LyricsViewer`, `PdfViewer`, `SetPlayer` once the CR is applied)
- `agent-spec/contracts/types.md` (`ResolvedItem`, `SongDetail`, `Resource`)
- `agent-spec/change-requests/LIST-11-set-player.md`
- `features/lists/ui/SetlistView.tsx` and `app/sw.ts` (how setlist pages and PDFs are saved for offline use)

## Design notes
- **No new route.** The player is a full-screen overlay inside the setlist page. Its state lives in the URL as `/lists/[id]?play=<n>` (1-based), set with `router.replace`, so reload and Back both work. The service worker saves list pages under a cache key with the query stripped (`pageCacheKey` in `app/sw.ts`), so the offline copy of the setlist also opens the player. Don't edit `app/sw.ts`.
- **Data.** The player needs no new server code. It uses the `ResolvedItem`s the page already has (effective key, BPM, energy, first chords, resources for the effective key) and the `songs?: SongDetail[]` the route already loads (lyrics, arrangement, time signature). Open chord charts through the same `getSignedResourceUrl` path `SetlistView` uses, so the service worker's PDF cache applies.
- **Pedals.** Most Bluetooth page turners send ArrowRight/ArrowLeft or PageDown/PageUp. Map both pairs to next/previous song. ArrowUp/ArrowDown and Space keep their normal scrolling.

## Deliverables
- [x] `SetPlayer` (`features/lists/ui/SetPlayer.tsx`), props as in the contract row the CR adds:
  - [x] A full-viewport dialog (`role="dialog"`, `aria-modal`, labelled by the setlist name). Focus is trapped inside; Escape or the Close button exits and returns focus to Start.
  - [x] Header: "Song 2 of 6", the title, the effective key (`KeyBadge`), BPM on the energy chip with its label (`ENERGY_META`), and the time signature. Each overridden value is marked as it is in the setlist row.
  - [x] A "First chords" strip pinned under the header (reuse `FirstChords` from `ItemOverrideEditor`). It shows `X` for missing chords and "No files for this key" when `needsUpload`.
  - [x] Lyrics in arrangement order (reuse `LyricsViewer`, `mode="arrangement"`). Text size uses A− / A+ controls with 4 steps; the base step is at least 20px. The size is kept in `localStorage`. The lyrics scroll back to the top on every song change.
  - [x] Chart buttons: one per chord chart, lead sheet or score PDF for the effective key, with chord charts first. Each opens `PdfViewer` on top of the player; closing it returns to the lyrics. When there are no PDFs, the buttons are hidden.
  - [x] Navigation: Previous and Next buttons (at least 44px, in the footer); "Next: <title>" shown in the footer; ArrowLeft/ArrowRight and PageUp/PageDown; a horizontal swipe (at least 60px, mostly horizontal, ignored while text is selected). At the first and last song, the matching control is disabled and keys do nothing.
  - [x] An `aria-live="polite"` region announces "Song n of N: <title>" on every change.
  - [x] When a song has no details (`songs` missing or failed, or the song isn't in it), it still shows the header, first chords and chart buttons, with "Lyrics aren't available for this song." in place of the lyrics.
- [x] `wakeLock.ts`: `useScreenWakeLock(active: boolean)` requests `navigator.wakeLock.request('screen')` while active, requests it again on `visibilitychange` back to visible, and releases it on exit. It does nothing where the API is missing or refused, with no errors in the console.
- [x] Fullscreen: on Start, call `requestFullscreen()` where supported and exit it on close. Where it isn't supported (iPhone Safari), the fixed full-viewport overlay is enough.
- [x] **Touch** `SetlistView.tsx`:
  - [x] A **Start** button (Play icon, "Start") in the setlist header for every reader, not only editors. It's hidden when the list is empty.
  - [x] Read and write `?play=<n>`; mount `SetPlayer`. An out-of-range or malformed `n` opens song 1.
  - [x] "Show lyrics" in the resources panel opens `LyricsViewer` inside the panel instead of going to the song page, when details are loaded. Without details it keeps going to the song page.
- [x] **Touch** `SetlistView.test.tsx`: tests for Start (shown, hidden on an empty list, opens at `?play=`) and lyrics in place.
- [x] `/dev/set-player` gallery with fixtures: a 4-song set including an overridden key, a `needsUpload` song, a song without details, a song with 2 chord charts, and a long lyric that scrolls. Pick the start index from a control. The gallery index finds the page by itself.
- [x] `tests/e2e/set-player.spec.ts` against the local seeded stack: open a seeded setlist → Start → song 1 lyrics visible → ArrowRight → song 2 → reload stays on song 2 → open the chord chart → close → Escape exits to the setlist. It skips itself where seeded sign-in isn't available, like the other signed-in specs.

## Acceptance criteria
- [x] Unit tests cover:
  - [x] keys, buttons, swipe and the bounds at the first and last song
  - [x] the live announcement
  - [x] focus trap and focus return
  - [x] the missing-details and `needsUpload` states
  - [x] text size persisting
  - [x] Wake Lock acquire, release and re-acquire, plus the unsupported path
  - [x] the `?play=` parsing
- [x] Works at 360px wide with no horizontal scroll, and at 1280px.
- [x] axe finds no serious or critical issues on `/dev/set-player` (H-04's `a11y.spec.ts` scans every gallery page automatically).
- [ ] Checked by hand: after opening the setlist once online, the player and its opened chord charts still work with the browser offline.
- [x] Definition of Done in `AGENTS.md` §5 is satisfied.

## Out of scope (see `TODO.md`)
- Chords written over the lyrics (needs songs stored as ChordPro text; TODO #2 and #10)
- A leader's device moving everyone else's screen (TODO #10)
- Auto-scroll, transposing, and editing the setlist from inside the player

## Boundaries
- **Owns** (create/modify freely): `features/lists/ui/SetPlayer.tsx`, `features/lists/ui/SetPlayer.test.tsx`, `features/lists/ui/wakeLock.ts`, `features/lists/ui/wakeLock.test.ts`, `app/dev/set-player/`, `tests/e2e/set-player.spec.ts`
- **Touches** (small integration edits only; describe each in the PR): `features/lists/ui/SetlistView.tsx`, `features/lists/ui/SetlistView.test.tsx`
- Anything else: do not edit. Open a change request (`AGENTS.md` §6).

## Owner decisions (2026-11-04)

Picked up again by the owner as "Start event", with roles. These replace the original single view where they differ:

- **Start event** asks every time: musician, vocalist or projectionist. The role can be switched inside the player. The URL is `?play=<n>&as=<role>`; a URL without `as` asks.
- **Musician:** first chords, then a chart. Typed chords (LIB-22) and the key's chord chart, lead sheet and full score PDFs are all options. With more than one, ask which each time the song comes up (no remembering). PDFs render inline, pages stacked and fit to width, with **Zoom** opening `PdfViewer`. No chart: lyrics plus first chords. Typed chords in another key than the setlist's: show them with a warning (no transposing).
- **Vocalist:** title, "Song n of N", key, A−/A+ text size, lyrics only.
- **Autoscroll** for musicians and vocalists: toggle plus a 1–10 speed slider. The speed is remembered per song on the device. Autoscroll turns off on every song change.
- **Page turner (musician):** each press scrolls one screen; at the end the next press changes song. Vocalists and projectionists: next/previous song.
- **Projectionist:** running order with the current song marked; each song's arrangement, each section's first line and its projection files. Next/previous move the current song.

Shipped with these, plus everything in Deliverables. Wake lock and the player live in `features/lists/ui/player/` rather than `features/lists/ui/`.

## Owner decision (2026-11-05)

Roles are removed. Each song's **Play** button opens the player directly at that song (no `StartEventDialog`), and the player always shows the musician view: first chords and a chart ("Which chart?" when there are several), lyrics plus first chords without a chart, and the key-mismatch warning. Text size, autoscroll and the page-turner behaviour apply to everyone. The vocalist and projectionist views, the role menu and the role helpers are gone. The URL is `?play=<n>`; `as=` from older links is ignored.
