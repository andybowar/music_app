---
id: LIB-23
title: "Chords over the lyrics per key"
phase: 1
wave: 12
stream: fullstack
size: L
status: done
human_required: false
depends_on: ["LIB-22", "LIB-02", "LIST-11"]
blocks: []
owns: ["db/migrations/0011_chords_per_key.sql", "features/songs/ui/form/chordKeys.ts", "features/songs/ui/form/chordKeys.test.ts"]
touches: ["lib/lyrics/chords.ts", "lib/lyrics/realign.ts", "lib/lyrics/realign.test.ts", "lib/lyrics/transpose.ts", "lib/lyrics/transpose.test.ts", "db/migrations/meta/", "db/schema/keys.ts", "db/schema/songs.ts", "db/seed/data.ts", "db/seed/data.test.ts", "types/domain.ts", "types/validation.ts", "types/validation.test.ts", "features/songs/server/keys.ts", "features/songs/server/keys.int.test.ts", "features/songs/server/songs.ts", "features/songs/server/songs.int.test.ts", "features/songs/server/assemble.ts", "features/songs/server/assemble.test.ts", "features/songs/ui/form/LyricsSection.tsx", "features/songs/ui/form/LyricsSection.test.tsx", "features/songs/ui/form/MusicalSection.tsx", "features/songs/ui/form/types.ts", "features/songs/ui/form/toInput.ts", "features/songs/ui/form/toInput.test.ts", "features/songs/ui/SongPage.tsx", "features/search/ui/RowPanels.tsx", "features/lists/ui/SetlistView.tsx", "features/lists/ui/player/charts.ts", "features/lists/ui/player/charts.test.ts", "features/lists/ui/player/MusicianView.tsx", "components/song/LyricsViewer.tsx", "components/song/LyricsViewer.test.tsx", "app/dev/chords/", "fixtures/songs.json", "fixtures/schemas.ts", "fixtures/fixtures.test.ts", "docs/user-guide.md", "agent-spec/SPEC.md", "agent-spec/TODO.md", "agent-spec/contracts/schema.md", "agent-spec/contracts/types.md", "agent-spec/contracts/ui.md", "agent-spec/contracts/api.md"]
requirements: ["REQ-LIB-15"]
---

# LIB-23 · Chords over the lyrics per key


**Goal.** A song can have typed chords for each of its keys, not just one. Requested by the project owner on 2026-11-04.

## Owner decisions (2026-11-04)
- Chords attach to the song's keys (Keys & tempo); removing a key removes its chords.
- Editing works like LIB-22 with a key switcher. The words are shared: editing them in one key changes them for every key, and the other keys' chords move to follow.
- A key without chords can start from the words or be filled by transposing another key's chords (TODO #2 as a starting point). Sharps or flats follow the target key's signature, switchable.
- Paste goes into the key being edited; the other keys follow the new words, with a note to check them.
- Display: the event's key (set player) or the primary key (song page) first, switchable.

## Design
- **Storage.** `song_keys.chord_lyrics` (jsonb, migration `0011`, add-only) with a backfill from LIB-22's `songs.chord_lyrics` onto the key they were written in, else the primary. The song-level columns stay (deprecated, no longer written) until a later migration drops them.
- **API.** `songKeyInputSchema.chords` is optional: omitted keeps what's stored (so callers that don't know about chords can't wipe them), null removes. `setSongKeys` refuses a section whose words differ from the song's lyrics (`<i>.chords.<section>`). `SongKey.chords` replaces `SongDetail.chords`.
- **Pure modules.** `lib/lyrics/transpose.ts` (roots and slash basses; quality kept; marks untouched); `lib/lyrics/realign.ts` (line alignment, then letter-level mapping on edited lines; chord-only lines kept; dropped chords counted); `features/songs/ui/form/chordKeys.ts` (form state). While one field is edited, the other keys follow from a snapshot taken when editing started, so clearing a field doesn't lose them.
- **Form.** Chords live on `musical.keys[i].chords`; `LyricsSection` patches `musical` as well as `lyrics`. Loading a song brings stale chords onto the current words.
- **Display.** `LyricsViewer` takes `SongChords[]` with a key switcher; the set player offers typed chords per key, the setlist's key first.

## Deliverables
- [x] Migration, schema, seed, fixtures (Amazing Grace's G key)
- [x] Transpose and realign modules with tests (including a seeded fuzz test that the words always match)
- [x] Server: per-key chords in `setSongKeys` with the words check and audit; song-level chords no longer written
- [x] Form: key picker, start / fill-from with sharps or flats, per-key remove, paste into the key, follow-the-words editing
- [x] Viewers: song page, library panel, setlist lyrics panel, set player
- [x] `/dev/chords` gallery: two keys plus a key without chords

## Acceptance criteria
- [x] Unit and integration tests; backfill checked against local data in a rolled-back transaction
- [x] Works at 360px
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Out of scope
- Transposing on the fly while reading (no stored chords for that key), and PDFs
- Dropping the deprecated `songs.chord_lyrics` / `chords_key` (a later migration)
