'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { samplePdfObjectUrl, sampleToneObjectUrl } from '@/components/media/sampleMedia';
import { Toaster } from '@/components/ui/sonner';
import { ItemOverrideEditor } from '@/features/lists/ui/ItemOverrideEditor';
import {
  SetlistActionsProvider,
  SetlistView,
  SetlistViewSkeleton,
  type SetlistActions,
} from '@/features/lists/ui/SetlistView';
import { LIST_IDS, SONG_IDS, getItemsForList, getList, getSong, songs } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import {
  SIGNED_URL_TTL_SECONDS,
  type ActionResult,
  type ListDetail,
  type ListItem,
} from '@/types/domain';
import type { ListItemPatch } from '@/types/validation';

const LIST_ID = LIST_IDS.bg41926;
const FAKE_LATENCY_MS = 300;

type View = 'editable' | 'read-only' | 'empty' | 'loading' | 'editor';

const VIEW_LABEL: Record<View, string> = {
  editable: 'Editable (owner or music leader)',
  'read-only': 'Read-only (member of another branch)',
  empty: 'Empty setlist',
  loading: 'Loading skeleton',
  editor: 'ItemOverrideEditor alone',
};

function wait() {
  return new Promise((resolve) => setTimeout(resolve, FAKE_LATENCY_MS));
}

function detailOf(items: ListItem[], name: string, eventDate: string | null): ListDetail {
  return {
    ...getList(LIST_ID),
    name,
    eventDate,
    itemCount: items.length,
    items: items.map((i) => resolveItemDisplay(getSong(i.songId), i)),
  };
}

/**
 * Body of `/dev/setlist`: SetlistView (LIST-07) on the fixture list "BG 4/19/26", with
 * fixture-backed stand-ins for the list actions (`SetlistActionsProvider`): reorder, remove,
 * overrides and rename change this page's in-memory copy, so they "persist" until reload. Signed
 * URLs are generated sample media. "Holy Spirit" has no E key: override it to E to see X chords
 * and the upload prompt.
 */
export function SetlistGallery() {
  const [view, setView] = useState<View>('editable');
  const [fail, setFail] = useState(false);
  const [items, setItems] = useState<ListItem[]>(() => getItemsForList(LIST_ID));
  const [header, setHeader] = useState(() => {
    const list = getList(LIST_ID);
    return { name: list.name, eventDate: list.eventDate };
  });
  const [log, setLog] = useState<string[]>([]);
  const record = (entry: string) => setLog((l) => [entry, ...l].slice(0, 8));
  const media = useRef<{ pdf: string; tone: string } | null>(null);

  useEffect(() => {
    const pdf = samplePdfObjectUrl(2);
    const tone = sampleToneObjectUrl(4);
    media.current = { pdf, tone };
    return () => {
      URL.revokeObjectURL(pdf);
      URL.revokeObjectURL(tone);
      media.current = null;
    };
  }, []);

  const refused = (): ActionResult<never> => ({
    ok: false,
    error: { code: 'CONFLICT', message: 'Simulated failure.' },
  });

  const actions: SetlistActions = {
    async renameList(_id, name, eventDate) {
      await wait();
      record(`renameList(${name}, ${eventDate ?? 'no date'})`);
      if (fail) return refused();
      setHeader({ name, eventDate: eventDate ?? null });
      return { ok: true, data: undefined };
    },
    async deleteList() {
      await wait();
      record('deleteList()');
      return fail ? refused() : { ok: true, data: undefined };
    },
    async reorderList(_id, itemIds) {
      await wait();
      record(`reorderList(${itemIds.length} items)`);
      if (fail) return refused();
      setItems((prev) =>
        itemIds
          .map((id) => prev.find((i) => i.id === id))
          .filter((i): i is ListItem => i !== undefined)
          .map((i, position) => ({ ...i, position })),
      );
      return { ok: true, data: undefined };
    },
    async removeListItem(itemId) {
      await wait();
      record('removeListItem()');
      if (fail) return refused();
      setItems((prev) => prev.filter((i) => i.id !== itemId));
      return { ok: true, data: undefined };
    },
    async updateListItem(itemId, patch) {
      await wait();
      record(`updateListItem(${JSON.stringify(patch)})`);
      const item = items.find((i) => i.id === itemId);
      if (fail || !item) return refused();
      const next: ListItem = { ...item, ...(patch as ListItemPatch) };
      setItems((prev) => prev.map((i) => (i.id === itemId ? next : i)));
      return { ok: true, data: next };
    },
    async getSignedResourceUrl(id) {
      await wait();
      const resource = songs.flatMap((s) => s.resources).find((r) => r.id === id);
      if (fail || !resource || !media.current) {
        return { ok: false, error: { code: 'NOT_FOUND', message: 'File not found.' } };
      }
      const url = resource.format === 'pdf' ? media.current.pdf : media.current.tone;
      const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString();
      return { ok: true, data: { url, expiresAt } };
    },
  };

  // Stable while nothing changed: SetlistView adopts a new `list.items` as fresh server data.
  const empty = view === 'empty';
  const list = useMemo(
    () => detailOf(empty ? [] : items, header.name, header.eventDate),
    [empty, items, header],
  );
  const songDetails = useMemo(
    () => [...new Set(list.items.map((i) => i.song.id))].map(getSong),
    [list],
  );

  return (
    <div className="flex flex-col gap-2">
      <header className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 pt-4 sm:px-4">
        <p className="text-sm font-medium text-muted-foreground">
          LIST-07 · Setlist “BG 4/19/26” with fixture-backed list actions
        </p>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="flex flex-col gap-1">
            State
            <select
              className="min-h-tap rounded-md border bg-background px-2"
              value={view}
              onChange={(e) => setView(e.target.value as View)}
            >
              {Object.entries(VIEW_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-tap items-center gap-2">
            <input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} />
            Actions fail (changes roll back)
          </label>
        </div>
      </header>

      {view === 'loading' && <SetlistViewSkeleton />}
      {view === 'editor' && <EditorDemo />}
      {(view === 'editable' || view === 'read-only' || view === 'empty') && (
        <SetlistActionsProvider actions={actions}>
          <SetlistView key={view} list={list} canEdit={view !== 'read-only'} songs={songDetails} />
        </SetlistActionsProvider>
      )}

      <section className="mx-auto grid w-full max-w-4xl gap-2 px-3 pb-6 sm:px-4">
        <h2 className="text-sm font-medium text-muted-foreground">Action log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions yet.</p>
        ) : (
          <ul className="grid gap-1 text-sm" data-testid="action-log">
            {log.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ul>
        )}
      </section>
      <Toaster />
    </div>
  );
}

/** ItemOverrideEditor on its own, for "Holy Spirit" (keys Bb and A, no E). */
function EditorDemo() {
  const song = getSong(SONG_IDS.holySpirit);
  const base = getItemsForList(LIST_ID).find((i) => i.songId === song.id)!;
  const [item, setItem] = useState<ListItem>(base);
  const [last, setLast] = useState<ListItemPatch | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-4 sm:px-4">
      <h2 className="text-lg font-semibold">Key, BPM and energy · {song.title}</h2>
      <ItemOverrideEditor
        resolved={resolveItemDisplay(song, item)}
        keys={song.keys}
        onChange={(patch) => {
          setLast(patch);
          setItem((prev) => ({ ...prev, ...patch }));
        }}
      />
      <p className="text-sm text-muted-foreground" data-testid="last-patch">
        Last onChange: {last ? JSON.stringify(last) : 'none yet'}
      </p>
    </div>
  );
}
