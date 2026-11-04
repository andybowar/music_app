# CR SHR-04 · Remove the layout's share placeholder

**Status:** proposed
**Raised by:** SHR-04
**Affects:** `app/(app)/layout.tsx` (owned by the app-shell task), `contracts/ui.md` (`NavListActions`), SHR-04

## Problem

`app/(app)/layout.tsx` passes `NavListActions` a no-op server action, `sharePlaceholder`,
as `onShare`, "until SHR-04 (ShareDialog) replaces it". SHR-04 may only touch
`features/lists/ui/NavListActions.tsx`, `SetlistView.tsx` and `PlaylistView.tsx`, not the layout.

So SHR-04 wires Share inside `NavListActions`: pressing Share opens `ShareDialog` for the current
list. `onShare` is now optional and only notified. With the placeholder still passed, each
Share press also posts an empty server action, which is harmless but wasted.

## Proposal

In `app/(app)/layout.tsx`:

```diff
-// Placeholder until SHR-04 (ShareDialog) replaces it. A server action because a server layout
-// cannot pass a plain function to a client component.
-async function sharePlaceholder(): Promise<void> {
-  'use server';
-}
...
-                <NavListActions onShare={sharePlaceholder} canAddSong={can(user, 'song:write')} />
+                <NavListActions canAddSong={can(user, 'song:write')} />
```

Optionally drop `onShare` from `NavListActionsProps` afterwards. Its only other caller is
`features/lists/ui/NavListActions.test.tsx`.

## Interim

Nothing is broken. Share works from the nav, the setlist page and the playlist page.
