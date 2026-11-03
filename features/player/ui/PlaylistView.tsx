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
import { AudioLines, GripVertical, MoreVertical, Play } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

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
import { cn } from '@/components/ui/utils';
import { deleteList, renameList } from '@/features/lists/server/lists';
import { removeListItem, reorderList, updateListItem } from '@/features/lists/server/items';
import { listIndexHref } from '@/features/lists/ui/ListIndex';
import type { Track } from '@/features/player/engine';
import { AudioPicker, audioOptionLabel, playableResources } from '@/features/player/ui/AudioPicker';
import { PlayerBar } from '@/features/player/ui/PlayerBar';
import { usePlayer, type PlayerAdapterFactories } from '@/features/player/ui/usePlayer';
import { getSignedResourceUrl } from '@/features/resources/server/files';
import { parseYouTubeId } from '@/lib/youtube';
import type { ActionResult, ListDetail, ResolvedItem, Resource, UUID } from '@/types/domain';

// contracts/ui.md → PlaylistView (PLAY-05; REQ-LIST-05). A listening playlist: each song plays
// its chosen recording (an MP3 or a YouTube link, picked per row with AudioPicker). Play, pause,
// stop, skip and auto-advance come from the reducer (PLAY-01) via `usePlayer`; editors reorder,
// remove, rename and delete with the same list actions the setlist uses (LIST-01/02), all
// optimistic with rollback. Songs without a playable recording stay in the list but are skipped.

export interface PlaylistViewProps {
  list: ListDetail;
  /** `can(user, 'list:write', { list })`: pick recordings, reorder, remove, rename, delete. */
  canEdit: boolean;
  /** Test/gallery seam for the player adapters; defaults to the real MP3 and YouTube adapters. */
  adapters?: PlayerAdapterFactories;
}

const FALLBACK_ERROR = 'Something went wrong. Please try again.';
const NAME_MAX = 120;
/** Signed URLs are reused until this close to expiry. */
const URL_REUSE_MARGIN_MS = 60_000;

/** Where to go after deleting a playlist (Open Playlist, LIST-08). */
export const PLAYLISTS_HREF = listIndexHref('playlist');

const songHref = (songId: UUID) => `/songs/${encodeURIComponent(songId)}`;

async function settle<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch {
    return { ok: false, error: { code: 'INTERNAL', message: FALLBACK_ERROR } };
  }
}

export function songCountLabel(n: number): string {
  return n === 1 ? '1 song' : `${n} songs`;
}

/** The recording a row plays: its chosen resource, when that is still a playable item of the song. */
export function chosenResource(resolved: ResolvedItem): Resource | null {
  const id = resolved.item.resourceId;
  if (!id) return null;
  return playableResources(resolved.resources).find((r) => r.id === id) ?? null;
}

/**
 * The track for a resource, or null when it can't be played here. Stored files get an empty URL:
 * a signed one is fetched right before the track loads (`PlaylistView`'s `resolveTrack`).
 */
export function trackFor(resolved: ResolvedItem, resource: Resource | null): Track | null {
  if (!resource) return null;
  const base = { id: resolved.item.id, title: resolved.song.title };
  if (resource.url) {
    const videoId = parseYouTubeId(resource.url);
    if (videoId) return { ...base, source: { type: 'youtube', videoId } };
    // A non-YouTube video link can't be played inline; an external audio link plays as audio.
    return resource.kind === 'audio'
      ? { ...base, source: { type: 'mp3', url: resource.url } }
      : null;
  }
  if (resource.storagePath && resource.kind === 'audio') {
    return { ...base, source: { type: 'mp3', url: '' } };
  }
  return null;
}

/** The queue: one track per row with a playable recording, in list order. */
export function playlistTracks(items: readonly ResolvedItem[]): Track[] {
  return items.flatMap((i) => {
    const t = trackFor(i, chosenResource(i));
    return t ? [t] : [];
  });
}

export function movedMessage(title: string, index: number, total: number): string {
  return `Moved ${title} to ${index + 1} of ${total}`;
}

function titleOf(items: readonly ResolvedItem[], id: UniqueIdentifier): string {
  return items.find((i) => i.item.id === id)?.song.title ?? 'song';
}

function positionOf(items: readonly ResolvedItem[], id: UniqueIdentifier | undefined): number {
  return items.findIndex((i) => i.item.id === id);
}

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

const iconButtonClass =
  'inline-flex min-h-tap min-w-tap items-center justify-center rounded-md outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50';

// ----- Rows -------------------------------------------------------------------------------

interface RowProps {
  resolved: ResolvedItem;
  index: number;
  total: number;
  canEdit: boolean;
  playable: boolean;
  /** This row holds the player's current track. */
  current: boolean;
  /** …and it is audible right now. */
  playing: boolean;
  onPlay(): void;
  onPick(id: UUID | null): void;
  onMove(to: number): void;
  onRemove(): void;
}

function PlaylistRow({
  resolved,
  index,
  total,
  canEdit,
  playable,
  current,
  playing,
  onPlay,
  onPick,
  onMove,
  onRemove,
}: RowProps) {
  const { item, song } = resolved;
  const hasAudio = playableResources(resolved.resources).length > 0;
  const chosen = chosenResource(resolved);
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canEdit });

  const skippedNote = !hasAudio
    ? 'No audio yet · skipped'
    : !playable
      ? canEdit
        ? 'Choose a recording to include this song'
        : 'No recording chosen · skipped'
      : null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-item-id={item.id}
      data-playable={playable || undefined}
      aria-current={current ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-2 rounded-md border bg-card p-2 sm:flex-row sm:items-center',
        current && 'border-primary ring-1 ring-primary',
        isDragging && 'relative z-10 opacity-80',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {canEdit && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${song.title}, position ${index + 1} of ${total}`}
            className={cn(iconButtonClass, 'cursor-grab touch-none active:cursor-grabbing')}
          >
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
        )}
        <button
          type="button"
          className={iconButtonClass}
          disabled={!playable}
          aria-label={playable ? `Play ${song.title}` : `${song.title} has no recording to play`}
          title={playable ? `Play ${song.title}` : undefined}
          onClick={onPlay}
        >
          {playing ? (
            <AudioLines aria-hidden="true" className="size-4 text-primary" />
          ) : (
            <Play aria-hidden="true" className="size-4" />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-baseline gap-2">
            <span
              aria-hidden="true"
              className="shrink-0 text-sm text-muted-foreground tabular-nums"
            >
              {index + 1}.
            </span>
            <Link
              href={songHref(song.id)}
              className="truncate font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {song.title}
            </Link>
            {current && <span className="sr-only">(current track)</span>}
          </span>
          {skippedNote && <span className="text-xs text-muted-foreground">{skippedNote}</span>}
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-1 sm:w-72 sm:shrink-0">
        {canEdit ? (
          <AudioPicker
            resources={resolved.resources}
            value={chosen?.id ?? null}
            onChange={onPick}
            label={`Recording for ${song.title}`}
            className="min-w-0 flex-1 [&_p]:sr-only"
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
            {chosen ? audioOptionLabel(chosen) : hasAudio ? 'No recording' : 'No audio'}
          </span>
        )}
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Actions for ${song.title}`}
                className={iconButtonClass}
              >
                <MoreVertical aria-hidden="true" className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
                Remove from playlist
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}

// ----- Dialogs ----------------------------------------------------------------------------

function RenameDialog({
  name,
  listId,
  eventDate,
  open,
  onOpenChange,
  onRenamed,
}: {
  name: string;
  listId: UUID;
  eventDate: string | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  onRenamed(name: string): void;
}) {
  const id = useId();
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue(name);
    setError(null);
  }, [open, name]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Enter a name.');
      return;
    }
    setPending(true);
    const result = await settle(() => renameList(listId, trimmed, eventDate));
    setPending(false);
    if (!result.ok) {
      setError(result.error.fieldErrors?.name?.[0] ?? null);
      toast.error("Couldn't rename the playlist", { description: result.error.message });
      return;
    }
    toast.success('Playlist renamed');
    onRenamed(trimmed);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Rename playlist</DialogTitle>
            <DialogDescription>Give the playlist a new name.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-name`} className="text-sm font-medium">
              Name
            </label>
            <Input
              id={`${id}-name`}
              value={value}
              maxLength={NAME_MAX}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-name-error` : undefined}
            />
            {error && (
              <p id={`${id}-name-error`} className="text-sm text-destructive">
                {error}
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
  name,
  listId,
  open,
  onOpenChange,
  onDeleted,
}: {
  name: string;
  listId: UUID;
  open: boolean;
  onOpenChange(open: boolean): void;
  onDeleted(): void;
}) {
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    const result = await settle(() => deleteList(listId));
    setPending(false);
    if (!result.ok) {
      toast.error("Couldn't delete the playlist", { description: result.error.message });
      return;
    }
    toast.success('Playlist deleted');
    onOpenChange(false);
    onDeleted();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this playlist?</DialogTitle>
          <DialogDescription>
            “{name}” will be deleted. The songs and recordings stay in the library.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" disabled={pending} onClick={confirm}>
            {pending ? 'Deleting…' : 'Delete playlist'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ----- View -------------------------------------------------------------------------------

export function PlaylistView({ list, canEdit, adapters }: PlaylistViewProps) {
  const router = useRouter();
  const [items, setItems] = useState(list.items);
  const [name, setName] = useState(list.name);
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [status, setStatus] = useState('');

  // A refresh brings new server data: adopt it.
  useEffect(() => setItems(list.items), [list.items]);
  useEffect(() => setName(list.name), [list.name]);

  const tracks = useMemo(() => playlistTracks(items), [items]);

  // Signed URLs for stored MP3s, fetched when a track loads and reused until close to expiry.
  const chosenByItem = useMemo(
    () =>
      new Map(
        items.flatMap((i) => {
          const r = chosenResource(i);
          return r ? [[i.item.id, r] as const] : [];
        }),
      ),
    [items],
  );
  const resourcesByItem = useRef(chosenByItem);
  useEffect(() => {
    resourcesByItem.current = chosenByItem;
  }, [chosenByItem]);
  const signed = useRef(new Map<UUID, { url: string; expiresAt: number }>());
  const resolveTrack = useCallback(async (t: Track): Promise<Track> => {
    if (t.source.type !== 'mp3' || t.source.url) return t;
    const resource = resourcesByItem.current.get(t.id);
    if (!resource) throw new Error(`No recording for ${t.title}`);
    const cached = signed.current.get(resource.id);
    if (cached && cached.expiresAt - Date.now() > URL_REUSE_MARGIN_MS) {
      return { ...t, source: { type: 'mp3', url: cached.url } };
    }
    const result = await settle(() => getSignedResourceUrl(resource.id));
    if (!result.ok) {
      toast.error(`Couldn't play “${t.title}”`, { description: result.error.message });
      throw new Error(result.error.message);
    }
    signed.current.set(resource.id, {
      url: result.data.url,
      expiresAt: Date.parse(result.data.expiresAt),
    });
    return { ...t, source: { type: 'mp3', url: result.data.url } };
  }, []);

  const { state, dispatch, playFrom, youtubeContainerRef } = usePlayer(tracks, {
    resolveTrack,
    adapters,
  });
  const currentTrack = state.queue[state.index];
  const active =
    state.status === 'loading' || state.status === 'playing' || state.status === 'paused';
  const showVideo = active && currentTrack?.source.type === 'youtube';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function move(from: number, to: number) {
    if (from === to || to < 0 || to >= items.length) return;
    const before = items;
    const next = arrayMove(items, from, to);
    setItems(next);
    const title = before[from]?.song.title ?? 'song';
    setStatus(movedMessage(title, to, next.length));
    const result = await settle(() =>
      reorderList(
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

  function onDragEnd({ active: dragged, over }: DragEndEvent) {
    if (!over || dragged.id === over.id) return;
    void move(positionOf(items, dragged.id), positionOf(items, over.id));
  }

  async function remove(resolved: ResolvedItem) {
    const before = items;
    setItems(items.filter((i) => i.item.id !== resolved.item.id));
    const result = await settle(() => removeListItem(resolved.item.id));
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

  async function pick(resolved: ResolvedItem, resourceId: UUID | null) {
    const before = items;
    const replace = (patch: Partial<ResolvedItem['item']>) =>
      setItems((prev) =>
        prev.map((i) =>
          i.item.id === resolved.item.id ? { ...i, item: { ...i.item, ...patch } } : i,
        ),
      );
    replace({ resourceId });
    const result = await settle(() => updateListItem(resolved.item.id, { resourceId }));
    if (!result.ok) {
      setItems(before);
      toast.error(`Couldn't change the recording for “${resolved.song.title}”`, {
        description: result.error.message,
      });
      return;
    }
    replace({ resourceId: result.data.resourceId });
    router.refresh();
  }

  function playRow(itemId: UUID) {
    const i = tracks.findIndex((t) => t.id === itemId);
    if (i >= 0) playFrom(i);
  }

  const playableCount = tracks.length;
  const skipped = items.length - playableCount;

  return (
    <div className="flex min-h-full w-full flex-col">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-3 py-6 sm:px-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm font-medium text-muted-foreground">Playlist</p>
            <h1 className="text-2xl font-semibold break-words">{name}</h1>
            <p className="text-sm text-muted-foreground">
              {songCountLabel(items.length)}
              {skipped > 0 && ` · ${skipped} without a recording (skipped)`} · by {list.ownerName}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              className="min-h-tap"
              disabled={playableCount === 0}
              onClick={() => playFrom(0)}
            >
              <Play aria-hidden="true" />
              Play all
            </Button>
            {canEdit && (
              <>
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
            <p className="font-medium">No songs in this playlist yet.</p>
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
              <ol aria-label={`Songs in ${name}`} className="flex flex-col gap-2">
                {items.map((resolved, index) => {
                  const isCurrent = active && currentTrack?.id === resolved.item.id;
                  return (
                    <PlaylistRow
                      key={resolved.item.id}
                      resolved={resolved}
                      index={index}
                      total={items.length}
                      canEdit={canEdit}
                      playable={tracks.some((t) => t.id === resolved.item.id)}
                      current={isCurrent}
                      playing={isCurrent && state.status === 'playing'}
                      onPlay={() => playRow(resolved.item.id)}
                      onPick={(id) => void pick(resolved, id)}
                      onMove={(to) => void move(index, to)}
                      onRemove={() => void remove(resolved)}
                    />
                  );
                })}
              </ol>
            </SortableContext>
          </DndContext>
        )}

        <p role="status" aria-live="polite" className="sr-only">
          {status}
        </p>
      </div>

      {/* The YouTube iframe mounts here (CR PLAY-03); it must stay visible while a video plays. */}
      <div
        className={cn(
          'mx-auto w-full max-w-4xl px-3 sm:px-4',
          showVideo ? 'pb-2' : 'pointer-events-none h-0 overflow-hidden',
        )}
        aria-hidden={showVideo ? undefined : true}
      >
        <div
          ref={youtubeContainerRef}
          data-testid="youtube-player"
          className="aspect-video w-full max-w-sm overflow-hidden rounded-md bg-black [&>div]:size-full"
        />
      </div>

      <PlayerBar state={state} dispatch={dispatch} />

      {canEdit && (
        <>
          <RenameDialog
            name={name}
            listId={list.id}
            eventDate={list.eventDate}
            open={renameOpen}
            onOpenChange={setRenameOpen}
            onRenamed={(next) => {
              setName(next);
              router.refresh();
            }}
          />
          <DeleteDialog
            name={name}
            listId={list.id}
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            onDeleted={() => router.push(PLAYLISTS_HREF)}
          />
        </>
      )}
    </div>
  );
}

/** Loading state for the playlist route. */
export function PlaylistViewSkeleton() {
  return (
    <div
      className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-3 py-6 sm:px-4"
      aria-busy="true"
      aria-label="Loading playlist"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
