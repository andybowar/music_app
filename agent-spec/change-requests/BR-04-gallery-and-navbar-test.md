# CR BR-04 · `/dev/quick` gallery page and NavBar test touch

**Status:** proposed.

## Problem

1. AGENTS.md §5 asks every UI task for a `/dev/<name>` gallery page with fixtures, and §3 says
   each UI task adds its own `app/dev/<name>/`. BR-04's `owns` is only `app/(app)/quick/`, so the
   PR can't add one.
2. BR-04 may touch `components/NavBar.tsx` to add the quick lookup to `NAV_OVERFLOW_LINKS`, but
   `components/NavBar.test.tsx` (UI-02) asserted `NAV_OVERFLOW_LINKS` is empty. Any task that
   appends there (BR-02, BR-04) must change that one test, so the BR-04 PR replaces it with a test
   that the desktop More menu shows the "Quick theme lookup" link to `/quick`.

## Proposed diff

- Add `"app/dev/quick/"` to BR-04's `owns` and `"components/NavBar.test.tsx"` to its `touches`
  (and BR-02's, which appends to the same list), then regenerate `INDEX.md` / `tasks.json`.
- A follow-up PR adds `app/dev/quick/page.tsx` rendering `QuickLookup`
  (`app/(app)/quick/QuickLookup.tsx`) from `fixtures/songs.json` (via `songSummaries`) in its
  states: no text, top 12 of more, show full, more than 100, no matches with "did you mean",
  no matches, and search failed; behind `isDevGalleryEnabled()`.

`QuickLookup` already takes plain props (`query`, `result`, `failed`), so no component change is
needed. Until then, `app/(app)/quick/QuickLookup.test.tsx` covers the same states.

## Affects

- **BR-04**: one extra owned path, one extra touched file.
- **BR-02**: will need the same `NavBar.test.tsx` touch when it appends "Other branches".
- **UI-02**: one test case in `components/NavBar.test.tsx` changes (it assumed an empty list).
