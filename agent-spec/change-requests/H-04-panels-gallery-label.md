# CR H-04 · `/dev/panels` branch-code trigger label

**Status:** proposed.

## Problem

The H-04 axe scan (`tests/e2e/a11y.spec.ts`) reports one serious violation that sits outside
H-04's paths: on `/dev/panels`, the branch-code trigger in `app/dev/panels/PanelsGallery.tsx`
(owned by UI-06) is

```tsx
<button type="button" className={rowButton} aria-label="Branch usage">
  <BranchCode code={song.addedByBranchCode} />
</button>
```

Its visible text is the branch code (e.g. "SV") but its accessible name is "Branch usage", so axe
fails `label-content-name-mismatch` (WCAG 2.5.3 Label in Name). The real song row
(`components/song/SongRow.tsx`) doesn't have this problem: it shows the code and a hidden
"show branch usage" hint without an `aria-label`.

No `app/` route file had a violation; this gallery is the only one.

## Proposed diff

In `app/dev/panels/PanelsGallery.tsx`, drop the `aria-label` and name the button from its content,
as `SongRow` does:

```diff
-          <button type="button" className={rowButton} aria-label="Branch usage">
+          <button type="button" className={rowButton}>
             <BranchCode code={song.addedByBranchCode} />
+            <span className="sr-only">, show branch usage</span>
           </button>
```

Then remove the matching `KNOWN` entry in `tests/e2e/a11y.spec.ts`, which skips just this node
until the fix lands.

## Affects

- **UI-06** (`app/dev/panels/`): a two-line gallery change; any gallery test that finds the
  trigger by the name "Branch usage" should match `/show branch usage/` instead.
- **H-04**: delete one `KNOWN` entry afterwards.
