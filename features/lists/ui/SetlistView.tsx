'use client';

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, MoreVertical, PlayIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

import { PdfViewer } from '@/components/media/PdfViewer';
import { ResponsivePanel } from '@/components/ResponsivePanel';
import { SongRow } from '@/components/song/SongRow';
import { LyricsViewer } from '@/components/song/LyricsViewer';
import { ComposerPanel } from '@/components/song/panels/ComposerPanel';
import { KeyPanel } from '@/components/song/panels/KeyPanel';
import { ReminderPanel } from '@/components/song/panels/ReminderPanel';
import { ResourcesPanel } from '@/components/song/panels/ResourcesPanel';
import { UsagePanel } from '@/components/song/panels/UsagePanel';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { deleteList, renameList } from '@/features/lists/server/lists';
import { removeListItem, reorderList, updateListItem } from '@/features/lists/server/items';
import { listIndexHref } from '@/features/lists/ui/ListIndex';
import { getSignedResourceUrl } from '@/features/resources/server/files';
import { ShareDialog } from '@/features/sharing/ui/ShareDialog';
import { openPlan } from '@/features/songs/ui/SongPage';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import { SECTIONS } from '@/types/domain';
import type {
  ActionResult,
  ListDetail,
  ResolvedItem,
  Resource,
  SongDetail,
  UUID,
} from '@/types/domain';
import type { ListItemPatch } from '@/types/validation';

import { FirstChords, ItemOverrideEditor, UploadPrompt } from './ItemOverrideEditor';
import type { PlayerRole } from './player/playerPrefs';
import { parsePlayParams, withPlayParams } from './player/playUrl';
import { SetPlayer } from './player/SetPlayer';
import { StartEventDialog } from './player/StartEventDialog';

export interface SetlistViewProps {
  list: ListDetail;
  /** `can(user, 'list:write', { list })`: reorder, remove, overrides, rename, delete. */
  canEdit: boolean;
  /**
   * Full details of the list's songs, for the row panels and the override editor's key list.
   * Optional (agent-spec/change-requests/LIST-07-setlist-extras.md): without it, row taps open
   * the song page and the editor offers every key.
   */
  songs?: SongDetail[];
}

type PanelKind = 'key' | 'title' | 'composer' | 'resources' | 'usage' | 'edit' | 'lyrics';

const PANEL_TITLE: Record<PanelKind, string> = {
  key: 'Keys and first chords',
  title: 'First lines',
  composer: 'Composers',
  resources: 'Resources',
  usage: 'Branch usage',
  edit: 'Key, BPM and energy for this event',
  lyrics: 'Lyrics',
};

const FALLBACK_ERROR = 'Something went wrong. Please try again.';
const NAME_MAX = 120;

/** Where to go after deleting a setlist (Open Setlist, LIST-08). */
export const SETLISTS_HREF = listIndexHref('setlist');

export const songHref = (songId: UUID) => `/songs/${encodeURIComponent(songId)}`;

/** The server actions the view calls. */
export interface SetlistActions {
  renameList: typeof renameList;
  deleteList: typeof deleteList;
  reorderList: typeof reorderList;
  removeListItem: typeof removeListItem;
  updateListItem: typeof updateListItem;
  getSignedResourceUrl: typeof getSignedResourceUrl;
}

const SetlistActionsContext = createContext<SetlistActions>({
  renameList,
  deleteList,
  reorderList,
  removeListItem,
  updateListItem,
  getSignedResourceUrl,
});

/**
 * Swaps the list server actions for stand-ins, e.g. fixture-backed fakes in the `/dev/setlist`
 * gallery (agent-spec/change-requests/LIST-07-setlist-extras.md). The app never mounts it, so
 * `SetlistView` calls the real actions.
 */
export function SetlistActionsProvider({
  actions,
  children,
}: {
  actions: SetlistActions;
  children: ReactNode;
}) {
  return (
    <SetlistActionsContext.Provider value={actions}>{children}</SetlistActionsContext.Provider>
  );
}

/** Run an action and turn a thrown error (e.g. network) into an `ActionResult`. */
async function settle<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch {
    return { ok: false, error: { code: 'INTERNAL', message: FALLBACK_ERROR } };
  }
}

/** A plain event date ('YYYY-MM-DD', no time zone) in the user's locale. */
export function formatEventDate(date: string, locale?: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(parsed);
}

export function songCountLabel(n: number): string {
  return n === 1 ? '1 song' : `${n} songs`;
}

/** Position spoken to screen readers after a move, e.g. "Moved Agnus Dei to 2 of 5". */
export function movedMessage(title: string, index: number, total: number): string {
  return `Moved ${title} to ${index + 1} of ${total}`;
}

function titleOf(items: readonly ResolvedItem[], id: UniqueIdentifier): string {
  return items.find((i) => i.item.id === id)?.song.title ?? 'song';
}

function positionOf(items: readonly ResolvedItem[], id: UniqueIdentifier | undefined): number {
  return items.findIndex((i) => i.item.id === id);
}

/** Screen-reader announcements for dnd-kit, in terms of song titles and positions. */
function announcements(items: readonly ResolvedItem[]): Announcements {
  const total = items.length;
  return {
    onDragStart: ({ active }) =>
      `Picked up ${titleOf(items, active.id)}, position ${positionOf(items, active.id) + 1} of ${total}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${titleOf(items, active.id)} is over position ${positionOf(items, over.id) + 1} of ${total}.`
        : `${titleOf(items, active.id)} is no longer over the list.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${movedMessage(titleOf(items, active.id), positionOf(items, over.id), total)}.`
        : `${titleOf(items, active.id)} dropped. Order unchanged.`,
    onDragCancel: ({ active }) => `Moving ${titleOf(items, active.id)} cancelled. Order unchanged.`,
  };
}

const SCREEN_READER_INSTRUCTIONS = {
  draggable:
    'To reorder, press Space or Enter to pick up the song, use the arrow keys to move it, ' +
    'then press Space or Enter to drop it, or Escape to cancel.',
};

// ----- Rows -------------------------------------------------------------------------------

interface ItemRowProps {
  resolved: ResolvedItem;
  index: number;
  total: number;
  canEdit: boolean;
  onPanel(kind: PanelKind): void;
  onMove(to: number): void;
  onRemove(): void;
}

function ItemRow({ resolved, index, total, canEdit, onPanel, onMove, onRemove }: ItemRowProps) {
  const { item, song } = resolved;
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canEdit });
  // A panel picked from the menu opens once the menu has closed and given focus back to its
  // trigger. Opened any earlier, the menu's focus return lands outside the new popover and
  // closes it again; opened after, the panel returns focus to the trigger when it closes.
  const panelAfterMenu = useRef<PanelKind | null>(null);

  const handle = canEdit ? (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${song.title}, position ${index + 1} of ${total}`}
      className="inline-flex min-h-tap min-w-tap cursor-grab touch-none items-center justify-center rounded-md outline-none hover:bg-row-foreground/10 focus-visible:ring-2 focus-visible:ring-row-foreground active:cursor-grabbing"
    >
      <GripVertical aria-hidden="true" className="size-4" />
    </button>
  ) : undefined;

  const actions = canEdit ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${song.title}`}
          className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-md outline-none hover:bg-row-foreground/10 focus-visible:ring-2 focus-visible:ring-row-foreground"
        >
          <MoreVertical aria-hidden="true" className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={() => {
          const kind = panelAfterMenu.current;
          panelAfterMenu.current = null;
          if (kind) onPanel(kind);
        }}
      >
        <DropdownMenuItem
          className="min-h-tap"
          onSelect={() => {
            panelAfterMenu.current = 'edit';
          }}
        >
          Change key, BPM or energy
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-tap"
          disabled={index === 0}
          onSelect={() => onMove(index - 1)}
        >
          Move up
        </DropdownMenuItem>
        <DropdownMenuItem
          className="min-h-tap"
          disabled={index === total - 1}
          onSelect={() => onMove(index + 1)}
        >
          Move down
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="min-h-tap" variant="destructive" onSelect={onRemove}>
          Remove from setlist
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : undefined;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'relative z-10 opacity-80' : undefined}
      data-item-id={item.id}
    >
      <SongRow
        song={song}
        resolved={resolved}
        onKey={() => onPanel('key')}
        onTitle={() => onPanel('title')}
        onComposer={() => onPanel('composer')}
        onResources={() => onPanel('resources')}
        onUsage={() => onPanel('usage')}
        dragHandle={handle}
        addSlot={actions}
      />
      <div className="flex flex-col gap-1 px-2 pt-1 pb-2">
        <FirstChords chords={resolved.firstChords} className="text-xs" />
        {resolved.needsUpload && resolved.key && (
          <UploadPrompt songId={song.id} songKey={resolved.key} linked={canEdit} />
        )}
      </div>
    </li>
  );
}

// ----- Dialogs ----------------------------------------------------------------------------

function RenameDialog({
  list,
  open,
  onOpenChange,
  onRenamed,
}: {
  list: ListDetail;
  open: boolean;
  onOpenChange(open: boolean): void;
  onRenamed(name: string, eventDate: string | null): void;
}) {
  const id = useId();
  const [name, setName] = useState(list.name);
  const [date, setDate] = useState(list.eventDate ?? '');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const actions = useContext(SetlistActionsContext);
  const [pending, setPending] = useState(false);
  const needsDate = list.type === 'setlist';

  useEffect(() => {
    if (!open) return;
    setName(list.name);
    setDate(list.eventDate ?? '');
    setErrors({});
  }, [open, list.name, list.eventDate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const local: Record<string, string[]> = {};
    if (!trimmed) local.name = ['Enter a name.'];
    if (needsDate && !date) local.eventDate = ['Pick the event date.'];
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setPending(true);
    const eventDate = date || null;
    const result = await settle(() => actions.renameList(list.id, trimmed, eventDate));
    setPending(false);
    if (!result.ok) {
      setErrors(result.error.fieldErrors ?? {});
      toast.error("Couldn't rename the setlist", { description: result.error.message });
      return;
    }
    toast.success('Setlist renamed');
    onRenamed(trimmed, eventDate);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Rename setlist</DialogTitle>
            <DialogDescription>Change the name or the event date.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-name`} className="text-sm font-medium">
              Name
            </label>
            <Input
              id={`${id}-name`}
              value={name}
              maxLength={NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${id}-name-error` : undefined}
            />
            {errors.name && (
              <p id={`${id}-name-error`} className="text-sm text-destructive">
                {errors.name[0]}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-date`} className="text-sm font-medium">
              Event date
            </label>
            <Input
              id={`${id}-date`}
              type="date"
              value={date}
              required={needsDate}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={errors.eventDate ? true : undefined}
              aria-describedby={errors.eventDate ? `${id}-date-error` : undefined}
            />
            {errors.eventDate && (
              <p id={`${id}-date-error`} className="text-sm text-destructive">
                {errors.eventDate[0]}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  list,
  open,
  onOpenChange,
  onDeleted,
}: {
  list: ListDetail;
  open: boolean;
  onOpenChange(open: boolean): void;
  onDeleted(): void;
}) {
  const actions = useContext(SetlistActionsContext);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    const result = await settle(() => actions.deleteList(list.id));
    setPending(false);
    if (!result.ok) {
      toast.error("Couldn't delete the setlist", { description: result.error.message });
      return;
    }
    toast.success('Setlist deleted');
    onOpenChange(false);
    onDeleted();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this setlist?</DialogTitle>
          <DialogDescription>
            “{list.name}” will be removed for everyone. The songs stay in the library.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>
            {pending ? 'Deleting…' : 'Delete setlist'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----- View -------------------------------------------------------------------------------

/**
 * One setlist (REQ-LIST-03/04): rows in order with their event key, BPM, energy and first
 * chords. Editors reorder by drag and drop (pointer or keyboard via the handle) or the row's
 * Move up / Move down actions, remove songs, set per-song overrides, rename and delete. Every
 * change is optimistic and rolled back if the server refuses it. Without `canEdit` the view
 * is read-only.
 */
export function SetlistView({ list, canEdit, songs }: SetlistViewProps) {
  const router = useRouter();
  const actions = useContext(SetlistActionsContext);
  const [items, setItems] = useState(list.items);
  const [header, setHeader] = useState({ name: list.name, eventDate: list.eventDate });
  const [panel, setPanel] = useState<{ kind: PanelKind; itemId: UUID } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; title: string } | null>(null);
  const [status, setStatus] = useState('');
  /** The open set player (LIST-11), mirrored in the URL as `?play=<n>&as=<role>`. */
  const [play, setPlay] = useState<{ index: number; role: PlayerRole } | null>(null);
  /** The role question; `index` is where the player opens once a role is picked. */
  const [asking, setAsking] = useState<{ index: number } | null>(null);
  const startRef = useRef<HTMLButtonElement>(null);

  // A refresh brings new server data: adopt it.
  useEffect(() => setItems(list.items), [list.items]);
  useEffect(
    () => setHeader({ name: list.name, eventDate: list.eventDate }),
    [list.name, list.eventDate],
  );

  // Reopen the player from the URL (reload, Back, or the offline copy of this page).
  useEffect(() => {
    const state = parsePlayParams(window.location.search, list.items.length);
    if (!state) return;
    if (state.role) setPlay({ index: state.index, role: state.role });
    else setAsking({ index: state.index });
    // Only on arrival: later changes come from the player itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function showPlayer(next: { index: number; role: PlayerRole } | null) {
    setPlay(next);
    const { pathname, search, hash } = window.location;
    // history, not router.replace: the URL only records where the player is, so no refetch.
    window.history.replaceState(
      window.history.state,
      '',
      `${pathname}${withPlayParams(search, next)}${hash}`,
    );
  }

  function closePlayer() {
    showPlayer(null);
    requestAnimationFrame(() => startRef.current?.focus());
  }

  async function signedPdfUrl(r: Resource): Promise<string> {
    const result = await settle(() => actions.getSignedResourceUrl(r.id));
    if (!result.ok) throw new Error(result.error.message);
    return result.data.url;
  }

  // A stable id keeps dnd-kit's generated aria-describedby the same on server and client.
  const dndId = useId();
  const details = useMemo(() => new Map((songs ?? []).map((s) => [s.id, s])), [songs]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const current = panel ? items.find((i) => i.item.id === panel.itemId) : undefined;
  const currentDetail = current ? details.get(current.song.id) : undefined;

  function openPanel(resolved: ResolvedItem, kind: PanelKind) {
    // Panels other than the editor need the song's details; without them, use the song page.
    if (kind !== 'edit' && !details.has(resolved.song.id)) {
      router.push(songHref(resolved.song.id));
      return;
    }
    setPanel({ kind, itemId: resolved.item.id });
  }

  async function move(from: number, to: number) {
    if (from === to || to < 0 || to >= items.length) return;
    const before = items;
    const next = arrayMove(items, from, to);
    setItems(next);
    const title = before[from]?.song.title ?? 'song';
    setStatus(movedMessage(title, to, next.length));
    const result = await settle(() =>
      actions.reorderList(
        list.id,
        next.map((i) => i.item.id),
      ),
    );
    if (!result.ok) {
      setItems(before);
      setStatus(`Couldn't move ${title}. Order unchanged.`);
      toast.error("Couldn't save the new order", { description: result.error.message });
      return;
    }
    router.refresh();
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    void move(positionOf(items, active.id), positionOf(items, over.id));
  }

  async function remove(resolved: ResolvedItem) {
    const before = items;
    setItems(items.filter((i) => i.item.id !== resolved.item.id));
    const result = await settle(() => actions.removeListItem(resolved.item.id));
    if (!result.ok) {
      setItems(before);
      toast.error(`Couldn't remove “${resolved.song.title}”`, {
        description: result.error.message,
      });
      return;
    }
    toast.success(`Removed “${resolved.song.title}”`);
    router.refresh();
  }

  async function override(resolved: ResolvedItem, patch: ListItemPatch) {
    const detail = details.get(resolved.song.id);
    const before = items;
    const replace = (next: ResolvedItem) =>
      setItems((prev) => prev.map((i) => (i.item.id === next.item.id ? next : i)));
    if (detail) replace(resolveItemDisplay(detail, { ...resolved.item, ...patch }));

    const result = await settle(() => actions.updateListItem(resolved.item.id, patch));
    if (!result.ok) {
      setItems(before);
      toast.error(`Couldn't update “${resolved.song.title}”`, {
        description: result.error.message,
      });
      return;
    }
    if (detail) replace(resolveItemDisplay(detail, result.data));
    toast.success(`Updated “${resolved.song.title}” for this setlist`);
    router.refresh();
  }

  async function openResource(r: Resource) {
    const plan = openPlan(r);
    if (plan.type === 'none') return;
    if (plan.type === 'link' || (plan.type === 'audio' && !plan.signed)) {
      window.open(plan.url, '_blank', 'noopener,noreferrer');
      return;
    }
    const result = await settle(() => actions.getSignedResourceUrl(r.id));
    if (!result.ok) {
      toast.error(`Couldn't open ${r.label}`, { description: result.error.message });
      return;
    }
    if (plan.type === 'pdf') {
      setPanel(null);
      setPdf({ url: result.data.url, title: r.label });
    } else {
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    }
  }

  function panelBody() {
    if (!panel || !current) return null;
    if (panel.kind === 'edit') {
      return (
        <ItemOverrideEditor
          resolved={current}
          keys={currentDetail?.keys ?? []}
          onChange={(patch) => void override(current, patch)}
        />
      );
    }
    if (!currentDetail) return null;
    switch (panel.kind) {
      case 'key':
        return (
          <div className="flex flex-col gap-3">
            <KeyPanel keys={currentDetail.keys} highlightKey={current.key ?? undefined} />
            {current.needsUpload && current.key && (
              <UploadPrompt songId={current.song.id} songKey={current.key} linked={canEdit} />
            )}
          </div>
        );
      case 'title':
        return (
          <ReminderPanel
            chorusLine={currentDetail.chorusLine}
            verse1Line={currentDetail.verse1Line}
          />
        );
      case 'composer':
        return <ComposerPanel composers={currentDetail.composers} />;
      case 'lyrics':
        return (
          <LyricsViewer
            lyrics={currentDetail.lyrics}
            arrangement={currentDetail.arrangement}
            chords={currentDetail.chords}
          />
        );
      case 'usage':
        return (
          <UsagePanel
            addedByBranchCode={currentDetail.addedByBranchCode}
            usage={currentDetail.usage}
          />
        );
      case 'resources':
        return (
          <ResourcesPanel
            resources={current.resources}
            keys={currentDetail.keys}
            onOpen={(r) => void openResource(r)}
            onShowLyrics={() => setPanel({ kind: 'lyrics', itemId: current.item.id })}
            hasLyrics={SECTIONS.some((s) => !!currentDetail.lyrics[s]?.trim())}
            addFilesSlot={
              current.needsUpload && current.key ? (
                <UploadPrompt songId={current.song.id} songKey={current.key} linked={canEdit} />
              ) : undefined
            }
          />
        );
    }
  }

  const panelTitle = panel && current ? `${PANEL_TITLE[panel.kind]} · ${current.song.title}` : '';

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-3 py-6 sm:px-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-sm font-medium text-muted-foreground">Setlist</p>
          <h1 className="text-2xl font-semibold break-words">{header.name}</h1>
          <p className="text-sm text-muted-foreground">
            {header.eventDate && (
              <>
                <time dateTime={header.eventDate} suppressHydrationWarning>
                  {formatEventDate(header.eventDate)}
                </time>
                {' · '}
              </>
            )}
            {songCountLabel(items.length)}
            {list.branchCode && ` · ${list.branchCode}`} · by {list.ownerName}
          </p>
          {!canEdit && (
            <p className="text-sm text-muted-foreground">
              View only. Only the owner or a music leader of the branch can change this setlist.
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {items.length > 0 && (
            <Button ref={startRef} className="min-h-tap" onClick={() => setAsking({ index: 0 })}>
              <PlayIcon aria-hidden />
              Start event
            </Button>
          )}
          {canEdit && (
            <>
              <Button variant="outline" className="min-h-tap" onClick={() => setShareOpen(true)}>
                Share
              </Button>
              <Button variant="outline" className="min-h-tap" onClick={() => setRenameOpen(true)}>
                Rename
              </Button>
              <Button variant="outline" className="min-h-tap" onClick={() => setDeleteOpen(true)}>
                Delete
              </Button>
            </>
          )}
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed p-6">
          <p className="font-medium">No songs in this setlist yet.</p>
          <p className="text-sm text-muted-foreground">
            Add songs from the library with the ADD button on any song.
          </p>
          <Link
            href="/library"
            className="inline-flex min-h-tap items-center text-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            Find songs in the library
          </Link>
        </div>
      ) : (
        <DndContext
          id={dndId}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements: announcements(items),
            screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
          }}
        >
          <SortableContext
            items={items.map((i) => i.item.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol aria-label={`Songs in ${header.name}`} className="flex flex-col gap-1">
              {items.map((resolved, index) => (
                <ItemRow
                  key={resolved.item.id}
                  resolved={resolved}
                  index={index}
                  total={items.length}
                  canEdit={canEdit}
                  onPanel={(kind) => openPanel(resolved, kind)}
                  onMove={(to) => void move(index, to)}
                  onRemove={() => void remove(resolved)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      <ResponsivePanel
        open={panel !== null && current !== undefined}
        onOpenChange={(open) => !open && setPanel(null)}
        title={panelTitle}
      >
        {panelBody()}
      </ResponsivePanel>

      {canEdit && (
        <>
          <ShareDialog list={{ ...list, ...header }} open={shareOpen} onOpenChange={setShareOpen} />
          <RenameDialog
            list={{ ...list, ...header }}
            open={renameOpen}
            onOpenChange={setRenameOpen}
            onRenamed={(name, eventDate) => {
              setHeader({ name, eventDate });
              router.refresh();
            }}
          />
          <DeleteDialog
            list={list}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onDeleted={() => router.push(SETLISTS_HREF)}
          />
        </>
      )}

      <StartEventDialog
        open={asking !== null}
        onOpenChange={(open) => !open && setAsking(null)}
        onStart={(role) => {
          const index = asking?.index ?? 0;
          setAsking(null);
          showPlayer({ index, role });
        }}
      />
      {play && items.length > 0 && (
        <SetPlayer
          title={header.name}
          items={items}
          songs={songs}
          index={play.index}
          onIndexChange={(index) => showPlayer({ ...play, index })}
          role={play.role}
          onRoleChange={(role) => showPlayer({ ...play, role })}
          getPdfUrl={signedPdfUrl}
          onOpenResource={(r) => void openResource(r)}
          onClose={closePlayer}
        />
      )}

      {pdf && <PdfViewer url={pdf.url} title={pdf.title} onClose={() => setPdf(null)} />}
    </div>
  );
}

/** Loading state for the setlist route. */
export function SetlistViewSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-3 py-6 sm:px-4"
      aria-busy="true"
      aria-label="Loading setlist"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
