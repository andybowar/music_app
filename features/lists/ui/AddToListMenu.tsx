'use client';

import { CheckIcon, ListPlusIcon, Loader2Icon, PlusIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ActionResult, List, ListType, UUID } from '@/types/domain';
import type { ListInput } from '@/types/validation';

import { CreateListDialog } from './CreateListDialog';

export interface AddToListMenuProps {
  songId: UUID;
  /** The session's current list (`useCurrentList().current`); the "Current" option shows only when set. */
  current: List | null;
  /** Lists the user can add to. The current list may be included; it is not repeated under "Existing". */
  lists: List[];
  /** Usually `addListItem(listId, songId)` (LIST-02) with `songId` bound by the caller. */
  onAdd(listId: UUID): Promise<ActionResult<unknown>>;
  /** Usually `createList` (LIST-01), wrapped by the caller to also set the current list. */
  onCreate(input: ListInput): Promise<ActionResult<List>>;
  /**
   * Optional (CR LIST-06-undo-and-label). Reverses a successful add; receives the list id
   * and whatever `onAdd` returned in `data` (the new `ListItem`). The toast shows "Undo"
   * only when this is provided.
   */
  onUndo?(listId: UUID, added: unknown): Promise<ActionResult<unknown>>;
  /** Optional (CR LIST-06-undo-and-label). Song title for the button's accessible name. */
  songTitle?: string;
}

const PREFIX: Record<ListType, string> = { setlist: 'Event', playlist: 'Listen' };

/** Menu/toast label for a list, e.g. "Event: BG 4/19/26" or "Listen: Background 1". */
export function listLabel(list: Pick<List, 'type' | 'name'>): string {
  return `${PREFIX[list.type]}: ${list.name}`;
}

const FALLBACK_ERROR = 'Something went wrong. Please try again.';

async function settle<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch {
    return { ok: false, error: { code: 'INTERNAL', message: FALLBACK_ERROR } };
  }
}

const itemClass = 'min-h-tap cursor-pointer gap-2';

export function AddToListMenu({
  songId,
  current,
  lists,
  onAdd,
  onCreate,
  onUndo,
  songTitle,
}: AddToListMenuProps) {
  const [pending, setPending] = useState<List | null>(null);
  const [dialogType, setDialogType] = useState<ListType | null>(null);
  // Set when "New …" is picked; the dialog opens once the menu has handed focus back
  // to the trigger, so the dialog restores focus there when it closes.
  const queuedDialog = useRef<ListType | null>(null);

  const existing = lists.filter((l) => l.id !== current?.id);

  const addTo = async (list: List) => {
    setPending(list);
    const label = listLabel(list);
    const result = await settle(() => onAdd(list.id));
    setPending(null);

    if (!result.ok) {
      toast.error(`Couldn’t add to ${label}`, {
        description: result.error.message,
        action: { label: 'Retry', onClick: () => void addTo(list) },
      });
      return;
    }

    const added = result.data;
    toast.success(`Added to ${label}`, {
      action: onUndo
        ? {
            label: 'Undo',
            onClick: () => {
              void (async () => {
                const undone = await settle(() => onUndo(list.id, added));
                if (undone.ok) toast(`Removed from ${label}`);
                else toast.error(`Couldn’t undo: ${undone.error.message}`);
              })();
            },
          }
        : undefined,
    });
  };

  const select = (list: List) => {
    if (pending) return;
    void addTo(list);
  };

  const handleCreate = async (input: ListInput): Promise<ActionResult<List>> => {
    const result = await settle(() => onCreate(input));
    // The dialog reports the create and closes; the add then runs on its own.
    if (result.ok) void addTo(result.data);
    return result;
  };

  const busy = pending !== null;
  const accessibleName = busy
    ? `Adding to ${listLabel(pending)}`
    : songTitle
      ? `Add “${songTitle}” to a list`
      : 'Add to a list';

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open) queuedDialog.current = null;
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-song-id={songId}
            aria-label={accessibleName}
            aria-busy={busy || undefined}
            className="h-tap min-w-tap bg-background px-2 font-semibold text-foreground uppercase"
          >
            {busy ? (
              <Loader2Icon aria-hidden className="size-4 animate-spin" />
            ) : (
              <PlusIcon aria-hidden className="size-4" />
            )}
            <span>Add</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={8}
          className="w-72 max-w-[calc(100vw-1rem)]"
          onCloseAutoFocus={() => {
            const type = queuedDialog.current;
            queuedDialog.current = null;
            if (type) setDialogType(type);
          }}
        >
          {current ? (
            <>
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Current
                </DropdownMenuLabel>
                <DropdownMenuItem
                  className={itemClass}
                  disabled={busy}
                  onSelect={() => select(current)}
                >
                  <CheckIcon aria-hidden className="size-4 text-primary" />
                  <span className="truncate">{listLabel(current)}</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          ) : null}

          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {current ? 'Other lists' : 'Existing'}
            </DropdownMenuLabel>
            {existing.length === 0 ? (
              <DropdownMenuItem disabled className="min-h-tap text-muted-foreground">
                {current ? 'No other lists yet' : 'No lists yet'}
              </DropdownMenuItem>
            ) : (
              <div className="max-h-56 overflow-y-auto">
                {existing.map((list) => (
                  <DropdownMenuItem
                    key={list.id}
                    className={itemClass}
                    disabled={busy}
                    onSelect={() => select(list)}
                  >
                    <ListPlusIcon aria-hidden className="size-4" />
                    <span className="truncate">{listLabel(list)}</span>
                  </DropdownMenuItem>
                ))}
              </div>
            )}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs text-muted-foreground">New</DropdownMenuLabel>
            <DropdownMenuItem
              className={itemClass}
              disabled={busy}
              onSelect={() => {
                queuedDialog.current = 'setlist';
              }}
            >
              <PlusIcon aria-hidden className="size-4" />
              New event setlist…
            </DropdownMenuItem>
            <DropdownMenuItem
              className={itemClass}
              disabled={busy}
              onSelect={() => {
                queuedDialog.current = 'playlist';
              }}
            >
              <PlusIcon aria-hidden className="size-4" />
              New listening playlist…
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {(['setlist', 'playlist'] as const).map((type) => (
        <CreateListDialog
          key={type}
          type={type}
          open={dialogType === type}
          onOpenChange={(open) => setDialogType(open ? type : null)}
          onSubmit={handleCreate}
        />
      ))}
    </>
  );
}
