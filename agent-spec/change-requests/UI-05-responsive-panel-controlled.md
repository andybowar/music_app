# CR UI-05 · `ResponsivePanel` can be opened from a callback

**Status:** approved by project owner 2026-10-30. `contracts/ui.md` updated; the owner OK'd the lead editing `components/ResponsivePanel.tsx` (UI-01) directly, done in the same PR.

## Problem

`SongRow` (UI-05) reports taps on its key, title, composer, Resources and branch-code regions through plain callbacks (`onKey()`, `onTitle()`, …), as `contracts/ui.md` specifies. The row's buttons are internal to `SongRow`, so callers can't pass one of them to `ResponsivePanel` as its `trigger`.

`ResponsivePanel` (UI-01) keeps its open state internal and only opens from its own `trigger`:

```
{ trigger: ReactNode; title: string; children: ReactNode }
```

So SRCH-08, SRCH-09 and LIST-07 have no way to open a detail panel when a row callback fires.

## Contract diff (`contracts/ui.md`)

```diff
-| `ResponsivePanel` | `components/ResponsivePanel.tsx` | `{ trigger: ReactNode; title: string; children: ReactNode }` | UI-01 |
+| `ResponsivePanel` | `components/ResponsivePanel.tsx` | `{ trigger?: ReactNode; anchor?: ReactNode; open?: boolean; onOpenChange?(open: boolean): void; title: string; children: ReactNode }` — pass `trigger` (uncontrolled, as before) or `open` + `onOpenChange` (controlled, optional `anchor`) | UI-01 |
```

- `open` / `onOpenChange`: controlled open state. When `open` is omitted the panel behaves as today.
- `anchor`: used only without a `trigger`. On ≥768px the popover is positioned against it (e.g. the whole `SongRow`); below 768px it is rendered as-is and the sheet opens from the bottom. It does not open the panel itself.
- Focus: without a `trigger`, the panel must return focus on close to the element that was focused when it opened (the row button whose callback opened it). Radix does this only for its own trigger, so the component handles it (`onOpenAutoFocus` / `onCloseAutoFocus`).

Existing callers (`trigger` only) compile and behave unchanged.

## Implementation

Small, contained change to `components/ResponsivePanel.tsx` plus tests in `ResponsivePanel.test.tsx`:
- open state is `open ?? internal state`; changes call `onOpenChange`;
- no `trigger` → render `PopoverAnchor` around `anchor` (desktop) or `anchor` directly (sheet);
- focus-return handling as above;
- tests: controlled open from outside state, anchor positioning target, focus returns to the opener at both widths.

UI-01 is done; the owner chose to have the lead edit the file directly rather than route it through SRCH-08's touches.

## Affects

- UI-01: component gains the optional props.
- SRCH-08, SRCH-09, LIST-07, LIB-18: open row panels with `open` / `onOpenChange` (and `anchor={<SongRow …/>}` on desktop).
