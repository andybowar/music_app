# CR LIST-06 · `AddToListMenu` needs an undo callback (and a song title for its label)

**Status:** proposed.

## Problem

`tasks/LIST-06.md` requires a toast "Added to …" **with undo**, but the frozen
`AddToListMenu` props in `contracts/ui.md` have no way to reverse an add:

```
{ songId; current: List | null; lists: List[]; onAdd(listId): Promise<ActionResult<unknown>>; onCreate(input): Promise<ActionResult<List>> }
```

The component is props-only, so it cannot call `removeListItem(itemId)` (LIST-02) itself. Undo
needs a callback that receives the item `onAdd` just created (`addListItem` returns
`ActionResult<ListItem>`, which reaches the menu as `data: unknown`).

Separately, every song row renders its own ADD button, so screen readers hear a page of
identical "Add" buttons. The menu has only `songId`, not a title to put in the accessible name.

## Proposed diff (`contracts/ui.md`, both additive and optional)

```diff
-| `AddToListMenu` | `features/lists/ui/AddToListMenu.tsx` | `{ songId; current: List \| null; lists: List[]; onAdd(listId): Promise<ActionResult<unknown>>; onCreate(input): Promise<ActionResult<List>> }` | LIST-06 |
+| `AddToListMenu` | `features/lists/ui/AddToListMenu.tsx` | `{ songId; current: List \| null; lists: List[]; onAdd(listId): Promise<ActionResult<unknown>>; onCreate(input): Promise<ActionResult<List>>; onUndo?(listId, added: unknown): Promise<ActionResult<unknown>>; songTitle?: string }` | LIST-06 |
```

- `onUndo(listId, added)`: `added` is the `data` from the successful `onAdd` (the new
  `ListItem`); LIST-09 implements it as `removeListItem((added as ListItem).id)`. The toast shows
  "Undo" only when `onUndo` is passed.
- `songTitle`: used for the trigger's accessible name, `Add “<title>” to a list`.

## What LIST-06 ships meanwhile

Both props are implemented as optional, so code written against the current contract still
compiles and works (no undo button, generic "Add to a list" label). If this CR is rejected, the
two props are dropped from the component and the undo deliverable stays open.

## Affected tasks

- LIST-06 (this task): implements the optional props.
- LIST-09: should pass `onUndo` (via `removeListItem`) and `songTitle` from `AddToListAction`.
