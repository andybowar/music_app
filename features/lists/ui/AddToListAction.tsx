'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { ActionResult, List, ListItem, UUID } from '@/types/domain';
import type { ListInput } from '@/types/validation';

import { AddToListMenu } from './AddToListMenu';
import { useCurrentList } from './CurrentList';

/**
 * App wiring for list creation and Add-to-List (LIST-09; REQ-LIST-01, REQ-LIST-02).
 *
 * `ListActionsProvider` sits inside `CurrentListProvider` in the `(app)` layout. It receives the
 * list server actions (LIST-01/02) as props, plus the lists the user can add to, and exposes:
 * - `create(input)`: `createList`, then the new list becomes the session's current list
 *   (REQ-LIST-01) and joins the add-to options;
 * - the actions `AddToListAction` binds for each song row.
 *
 * `AddToListAction` renders nothing outside the provider, so components that render it (the
 * library's rows) still work in tests and galleries without the shell.
 */

export interface ListActions {
  /** `createList` (LIST-01). */
  createList(input: ListInput): Promise<ActionResult<List>>;
  /** `addListItem` (LIST-02). */
  addListItem(listId: UUID, songId: UUID): Promise<ActionResult<ListItem>>;
  /** `removeListItem` (LIST-02), used for the toast's Undo. */
  removeListItem(itemId: UUID): Promise<ActionResult<unknown>>;
}

export interface ListActionsProviderProps extends ListActions {
  /** Lists the user may add songs to (writable, newest event first). */
  lists: List[];
  children: ReactNode;
}

export interface ListActionsContextValue {
  /** Lists to offer under "Existing", including ones created since the page loaded. */
  lists: List[];
  /** Create a list and make it the current list. */
  create(input: ListInput): Promise<ActionResult<List>>;
  addListItem: ListActions['addListItem'];
  removeListItem: ListActions['removeListItem'];
}

const ListActionsContext = createContext<ListActionsContextValue | null>(null);

const FALLBACK_ERROR = 'Something went wrong. Please try again.';

/** Prepends lists not already present (by id). */
export function mergeLists(lists: List[], added: List[]): List[] {
  const seen = new Set(lists.map((l) => l.id));
  const fresh = added.filter((l) => !seen.has(l.id));
  return fresh.length ? [...fresh, ...lists] : lists;
}

export function ListActionsProvider({
  lists,
  createList,
  addListItem,
  removeListItem,
  children,
}: ListActionsProviderProps) {
  const { setCurrent } = useCurrentList();
  // Lists created in this page view. A new `lists` from the server (refresh / reload) already
  // contains them, so `mergeLists` drops the duplicates.
  const [created, setCreated] = useState<List[]>([]);

  const create = useCallback(
    async (input: ListInput): Promise<ActionResult<List>> => {
      let result: ActionResult<List>;
      try {
        result = await createList(input);
      } catch {
        result = { ok: false, error: { code: 'INTERNAL', message: FALLBACK_ERROR } };
      }
      if (result.ok) {
        const list = result.data;
        setCreated((prev) => [list, ...prev.filter((l) => l.id !== list.id)]);
        setCurrent(list);
      }
      return result;
    },
    [createList, setCurrent],
  );

  const merged = useMemo(() => mergeLists(lists, created), [lists, created]);

  const value = useMemo<ListActionsContextValue>(
    () => ({ lists: merged, create, addListItem, removeListItem }),
    [merged, create, addListItem, removeListItem],
  );

  return <ListActionsContext.Provider value={value}>{children}</ListActionsContext.Provider>;
}

/** The provider's value, or null outside a `ListActionsProvider`. */
export function useListActions(): ListActionsContextValue | null {
  return useContext(ListActionsContext);
}

export interface AddToListActionProps {
  songId: UUID;
  /** For the button's accessible name, `Add “<title>” to a list`. */
  songTitle?: string;
}

/**
 * The ADD control on a song row: `AddToListMenu` bound to this song and the shell's lists.
 * Adding never navigates, so the search results and their URL params stay as they were
 * (REQ-LIST-02).
 */
export function AddToListAction(props: AddToListActionProps) {
  const ctx = useListActions();
  if (!ctx) return null;
  return <BoundAddToList {...props} ctx={ctx} />;
}

function BoundAddToList({
  songId,
  songTitle,
  ctx,
}: AddToListActionProps & { ctx: ListActionsContextValue }) {
  const { current } = useCurrentList();
  const { lists, create, addListItem, removeListItem } = ctx;

  const onAdd = useCallback(
    (listId: UUID): Promise<ActionResult<unknown>> => addListItem(listId, songId),
    [addListItem, songId],
  );

  const onUndo = useCallback(
    (_listId: UUID, added: unknown): Promise<ActionResult<unknown>> => {
      const id = (added as Partial<ListItem> | null)?.id;
      if (typeof id !== 'string') {
        return Promise.resolve({
          ok: false,
          error: { code: 'INTERNAL', message: FALLBACK_ERROR },
        });
      }
      return removeListItem(id);
    },
    [removeListItem],
  );

  return (
    <AddToListMenu
      songId={songId}
      songTitle={songTitle}
      current={current}
      lists={lists}
      onAdd={onAdd}
      onCreate={create}
      onUndo={onUndo}
    />
  );
}
