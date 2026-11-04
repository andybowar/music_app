---
id: LIB-22
title: "Chords over the lyrics (optional)"
phase: 1
wave: 9
stream: fullstack
size: M
status: done
human_required: false
depends_on: ["LIB-01", "LIB-12", "LIB-16", "LIB-17", "LIB-18", "UI-07"]
blocks: ["LIST-11", "LIB-23"]
owns: ["db/migrations/0010_chord_lyrics.sql", "components/song/ChordLyrics.tsx", "components/song/ChordLyrics.test.tsx", "app/dev/chords/"]
touches: ["lib/lyrics/chords.ts", "lib/lyrics/chords.test.ts", "db/migrations/meta/", "db/schema/songs.ts", "db/seed/data.ts", "db/seed/data.test.ts", "types/domain.ts", "types/validation.ts", "types/validation.test.ts", "lib/lyrics/parse.ts", "features/songs/server/songs.ts", "features/songs/server/assemble.ts", "features/songs/server/assemble.test.ts", "features/songs/server/songs.int.test.ts", "features/songs/ui/form/types.ts", "features/songs/ui/form/toInput.ts", "features/songs/ui/form/toInput.test.ts", "features/songs/ui/form/LyricsSection.tsx", "features/songs/ui/form/LyricsSection.test.tsx", "components/song/LyricsViewer.tsx", "components/song/LyricsViewer.test.tsx", "features/songs/ui/SongPage.tsx", "features/search/ui/RowPanels.tsx", "fixtures/songs.json", "fixtures/schemas.ts", "fixtures/fixtures.test.ts", "docs/user-guide.md", "agent-spec/SPEC.md", "agent-spec/TODO.md", "agent-spec/contracts/schema.md", "agent-spec/contracts/types.md", "agent-spec/contracts/ui.md"]
requirements: ["REQ-LIB-15"]
---

# LIB-22 · Chords over the lyrics (optional)


**Goal.** When creating or editing a song, a contributor can optionally write chords into the lyrics, and readers see each chord above the word it's played on. Songs without chords work exactly as before. Requested by the project owner on 2026-11-04 (TODO #10, part 1).

## Design
- **Storage.** `songs.chord_lyrics` (jsonb: section → lyrics with `[chords]` inline, ChordPro style) and `songs.chords_key`, both nullable (migration `0010`, add-only). The plain `*_lyrics` columns stay the source for search, first lines and the DB-02 triggers, so chords never leak into search.
- **One source of truth in the form.** With chords on, each section field edits the chorded text and the plain lyrics are derived by removing the chords (`stripChords`). `songInputSchema` refuses chords whose words don't match the lyrics. Chords turned on with none typed are stored as null.
- **Paste.** "Paste full lyrics" also accepts chord sheets with chords on their own line above the words (`inlineChords` lines them up by column) or inline brackets, and offers to keep them.
- **Display.** `ChordLyrics` renders chords above the words, wrapping between words and never inside a word with a mid-word chord. `LyricsViewer` takes optional `chords` and shows a "Chords" toggle (remembered in `localStorage`) and "Chords in <key>".

## Deliverables
- [x] Migration `0010_chord_lyrics.sql`, schema, seed and fixtures (Amazing Grace fixture has made-up chords)
- [x] `lib/lyrics/chords.ts`: `hasChords`, `parseChordLine`, `stripChords`, `chordsMatchLyrics`, `chordLineTokens`, `inlineChords`; `parse.ts` exports `isHeadingLine` and treats a repeat that differs only by chords as the same section, keeping the chorded copy
- [x] `SongChords` type, `SongDetail.chords?`, `songInputSchema.chords`; server save/read/audit
- [x] Lyrics form section: "Add chords over the lyrics (optional)" checkbox, key picker, per-section preview, confirm before removing typed chords, chord-aware paste
- [x] `ChordLyrics` component, `LyricsViewer` `chords` prop, wired on the song page and library row panel
- [x] `/dev/chords` gallery

## Acceptance criteria
- [x] Unit tests for the chord module, renderer, viewer toggle, form helpers and form flows; schema tests; integration test for save, read, mismatch refusal, empty chords and audit
- [x] Works at 360px with no horizontal scroll, and at 1280px
- [x] Definition of Done in `AGENTS.md` §5 is satisfied

## Out of scope
- Transposing (TODO #2); `chords_key` is stored so it can be added later
- Chords in the set player (LIST-11, not built yet), CSV import of chords, and leader-driven paging (TODO #10 part 2)
