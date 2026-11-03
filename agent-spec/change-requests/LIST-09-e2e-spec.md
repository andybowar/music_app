# CR LIST-09 · Own the e2e spec for "create setlist → add 3 songs"

**Status:** proposed (opened with the LIST-09 PR).

## Problem

`tasks/LIST-09.md`'s acceptance criteria require a Playwright test ("Create Event Setlist →
search → add 3 songs → open setlist shows 3 in order"), but the task owns only
`features/lists/ui/AddToListAction.tsx` and `features/lists/ui/NavListActions.tsx`. `tests/e2e/`
is not owned by anyone, so the spec has no legal home. LIB-17 hit the same thing
(CR LIB-17-gallery-and-e2e) and was given its own spec file.

## Proposed diff

`agent-spec/tasks/LIST-09.md` frontmatter:

```diff
-owns: ["features/lists/ui/AddToListAction.tsx", "features/lists/ui/NavListActions.tsx"]
+owns: ["features/lists/ui/AddToListAction.tsx", "features/lists/ui/NavListActions.tsx", "tests/e2e/list-create-add.spec.ts"]
```

The LIST-09 PR includes `tests/e2e/list-create-add.spec.ts`. Like `song-form.spec.ts`, it
creates real rows, so it runs only when `E2E_MEMBER_EMAIL` / `E2E_MEMBER_PASSWORD` are set
(desktop Chromium only) and skips otherwise, including on Vercel previews. If this CR is
rejected, drop that file from the PR and the acceptance criterion stays open.

## Affects

- **LIST-09**: one extra owned path. No other task owns it.
- No contract changes.
