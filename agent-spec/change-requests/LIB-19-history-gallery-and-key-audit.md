# CR LIB-19 · Song history: gallery, a forced SongPage test edit, and song id on key audits

**Status:** approved by project owner 2026-11-03. Applied to `tasks/LIB-19.md` (also touches `features/songs/server/keys.ts` for item 3); the `songId` audit snapshot change is a LIB-19 follow-up.

## Problem

LIB-19 owns `features/audit/` and touches `features/songs/ui/SongPage.tsx`. Three things fall outside those paths:

1. **Gallery page.** AGENTS.md §5 asks for a `/dev/<name>` page with fixtures for new components, and §3 says each UI task adds its own `app/dev/<name>/`. LIB-19 doesn't list one (same gap as `ADM-01-dev-gallery.md` and `LIB-18-song-page-paths.md`).
2. **SongPage test.** `features/songs/ui/SongPage.test.tsx` (LIB-18) has a test named "shows a placeholder in the History tab before LIB-19 fills it". It asserts the placeholder text. Once the History tab renders `SongHistory`, that assertion can't pass, and the tab's default content calls the `loadAuditTrail` server action, which the test has to stub. Nothing inside LIB-19's paths avoids this.
3. **Deleted keys drop out of the song history.** `setSongKeys` (LIB-02, `features/songs/server/keys.ts`) audits `song_key` rows with `entityId` = the key row id, and its snapshot (`auditFields`) doesn't include `songId`. After a key is removed, its row is gone, so nothing links its audit rows (create, edits, delete) back to the song. Resources don't have this problem: their snapshots carry `songId`. `getAuditTrail('song', id)` already matches `song_key` rows on `diff.songId` (from or to), so a small change in LIB-02's file closes the gap.

## Proposed diff

`agent-spec/tasks/LIB-19.md` frontmatter (then regenerate with `python3 agent-spec/scripts/gen_index.py`):

```diff
-owns: ["features/audit/"]
-touches: ["features/songs/ui/SongPage.tsx"]
+owns: ["features/audit/", "app/dev/song-history/"]
+touches: ["features/songs/ui/SongPage.tsx", "features/songs/ui/SongPage.test.tsx"]
```

- The LIB-19 PR already contains `app/dev/song-history/` (gallery with fixture entries and trail, empty, loading, error and forbidden states) and its test.
- The `SongPage.test.tsx` edit stubs `@/features/audit/actions` and replaces the placeholder test with "loads the song history (LIB-19) when the History tab opens". No other test changes.

**Follow-up for item 3 (not in the LIB-19 PR; needs LIB-02's owner or an approved touch):** in `features/songs/server/keys.ts`, include `songId` in the snapshots passed to `recordAudit` for create and delete (for example `before: { songId: row.songId, ...auditFields(row) }`). `getAuditTrail` strips `songId` from the diff before it reaches the browser, so the UI doesn't change. Edits to a key that is later deleted stay unlinked, because an unchanged `songId` isn't in an update diff. The create and delete entries are what matter in the history.

## Affects

- **LIB-19**: one extra owned path and one extra touch, both included in the PR.
- **LIB-18** (done): one test replaced. No behaviour change beyond LIB-19's intended fill of the History tab.
- **LIB-02** (done): optional follow-up, a two-line change to audit snapshots.
