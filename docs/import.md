# Importing songs in bulk

Use the import to load an existing song collection into the Worship Library in one go: a
spreadsheet of songs plus a folder of charts, recordings and projection files. You can run
it as often as you like. Songs that are already in the library are updated, not copied.

Music leaders prepare the spreadsheet and the folder. An admin (or a developer on their
behalf) runs the import, because it writes straight to the database.

## 1. Fill in the spreadsheet

Start from [`import-template.csv`](./import-template.csv). Open it in Excel, Numbers or
Google Sheets, keep the header row, and add one row per song. Save as **CSV (UTF-8)**.

| Column                                                                | What to enter                                                                                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                                                               | Required. The song's usual title.                                                                                                           |
| `alt_titles`                                                          | Other names people search for, separated by `;`.                                                                                            |
| `composers`                                                           | Required. Separate names with `;`. Add `[past]` or `[current]` after a People of Praise member, e.g. `Jane Example [current]; John Sample`. |
| `source_group`                                                        | Album, songbook or group the song comes from.                                                                                               |
| `year`                                                                | Year written or published, e.g. `2004`.                                                                                                     |
| `primary_key`, `alt_keys`                                             | The key we usually sing, then other keys separated by `;`. Write keys like `D`, `Eb`, `F#`, `Bbm`.                                          |
| `tempo_bpm`, `time_signature`                                         | E.g. `128` and `4/4`.                                                                                                                       |
| `energy_level`                                                        | One of `high_praise`, `high_worship`, `mid_worship`, `deep_worship`, `quiet_worship` (see the [tagging guide](./tagging-guide.md)).         |
| `energy_notes`                                                        | Free text, e.g. "starts light, big bridge build".                                                                                           |
| `intro_chord`, `verse_chord`, `chorus_chord`, `bridge_chord`          | First chords in the primary key.                                                                                                            |
| `themes_chorus`, `themes_verse_1` … `themes_verse_5`, `themes_bridge` | Themes per section, separated by `;`.                                                                                                       |
| `usage_SV`, `usage_OR`, … (one per branch code)                       | How often that branch sings it: `high`, `low`, `rare` or `none`.                                                                            |
| `added_by`                                                            | The branch code that added the song, e.g. `SV`.                                                                                             |
| `youtube_links`                                                       | Links to recordings, separated by `;`.                                                                                                      |

Tips:

- Leave a cell empty if you don't know. **An empty cell never erases anything** that is
  already in the library.
- Columns can be in any order, and you can leave out columns you don't use (only `title`
  and `composers` are required).
- Don't paste full lyrics into the spreadsheet. Lyrics are entered in the app.

## 2. Name the files

Put every file in one folder (subfolders are fine). Name each file so the import can tell
which song, key and kind of file it is:

```
<Title> - <Key> - <Kind>.<ext>
<Title> - <Key> - <Kind> 2.<ext>        (a second file of the same kind and key)
<Title> - Projection.<pro|mdb|ppt|pptx>
```

Kinds: `Full Score`, `Lead Sheet`, `Chord Chart` (PDF), `Audio` or `MP3` (mp3 or m4a),
`Instruction` (PDF or mp3), `Projection`. Examples:

```
1000 Hallelujahs - Db - Chord Chart.pdf
1000 Hallelujahs - D - Chord Chart 2.pdf
1000 Hallelujahs - D - Audio.mp3
1000 Hallelujahs - Projection.pptx
```

- The title must match the spreadsheet's `title` or one of its `alt_titles`. Capitals,
  punctuation and small typos are forgiven; the report flags any match that wasn't exact.
- A file for a key the spreadsheet doesn't list adds that key to the song (the report
  warns you).
- Files must be under 50 MB. Hidden files (like `.DS_Store`) are ignored.

## 3. Do a dry run

A dry run reads everything and reports what _would_ happen, without saving anything or
uploading files. Always do one first.

```bash
pnpm run import --csv songs.csv --files ./song-files --actor admin@example.org --dry-run --report report.md
```

(Type `pnpm run import`, not `pnpm import`: the latter is a different pnpm command.)

- `--csv`: the spreadsheet saved as CSV.
- `--files`: the folder of files (optional).
- `--actor`: the email of an admin account. Every change is recorded in the song history
  under this person.
- `--report`: where to write the report. Without it the report is printed in the terminal.

The person running it needs `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` for the target environment, in the environment or in
`.env.local`. The terminal shows which database it is about to write to.

## 4. Read the report

The report has a summary table and then these sections (empty ones are left out):

| Section                 | Meaning                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| **Created**             | New songs, with the files attached to each.                                                               |
| **Updated**             | Songs already in the library that changed, and what changed (e.g. "tempo; themes (chorus)").              |
| **Unchanged (skipped)** | Songs already in the library that the spreadsheet doesn't change.                                         |
| **Errors**              | Rows or files that were left out, with the spreadsheet line number and the reason. Fix and re-run.        |
| **Warnings**            | Things worth a look that didn't stop the import: new composers or themes, fuzzy file matches, added keys. |
| **Unmatched files**     | Files whose name didn't fit the pattern or didn't match any song. Rename them and re-run.                 |

Look closely at **new composers** and **new themes**: a typo creates a second composer or
theme. Fix the spreadsheet and dry-run again until the report looks right.

## 5. Run it for real

Run the same command without `--dry-run`:

```bash
pnpm run import --csv songs.csv --files ./song-files --actor admin@example.org --report report.md
```

Each spreadsheet row is saved on its own, so one bad row doesn't stop the others. The
command exits with an error code if anything is listed under **Errors**.

## Running it again

It is safe to run the import again with the same or a corrected spreadsheet:

- A song is the same song when its **title (ignoring capitals) and year** match. Changing a
  song's title or year in the spreadsheet creates a new song instead.
- A filled cell replaces the library's value (composers and each section's themes are
  replaced as a whole). An empty cell leaves the library alone.
- Keys, links and files are only ever added. A file is skipped when the song already has a
  file of the same kind and label in that key (e.g. `Chord Chart 2` in `D`), so nothing is
  uploaded twice. To replace a file, delete it in the app first.
- Nothing is ever deleted by the import. Songs deleted in the app are not brought back; a
  row for one creates a fresh song.
