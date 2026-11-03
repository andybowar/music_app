'use client';

import { useMemo, useState } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { PlaylistView, type PlaylistActions } from '@/features/player/ui/PlaylistView';
import { LIST_IDS, getItemsForList, getList, getSong } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import {
  SIGNED_URL_TTL_SECONDS,
  type ActionResult,
  type ListDetail,
  type ListItem,
  type Resource,
  type SongDetail,
  type UUID,
} from '@/types/domain';

import { SILENT_MP3_LONGER, SILENT_MP3_SHORT } from './silentAudio';

type View = 'editable' | 'read-only' | 'empty';

const VIEWS: Array<{ id: View; label: string }> = [
  { id: 'editable', label: 'Editable (owner)' },
  { id: 'read-only', label: 'Read-only' },
  { id: 'empty', label: 'Empty playlist' },
];

const fixtureList = getList(LIST_IDS.background1);
const fixtureItems = getItemsForList(LIST_IDS.background1);

/** A silent MP3 recording added to a fixture song (an external audio link, so no signing). */
function silentRecording(
  song: SongDetail,
  id: UUID,
  label: string,
  url: string,
  songKeyId: UUID | null,
): Resource {
  return {
    id,
    songId: song.id,
    songKeyId,
    kind: 'audio',
    format: 'url',
    label,
    url,
    storagePath: null,
    sizeBytes: null,
    mimeType: 'audio/mpeg',
    createdAt: song.updatedAt,
  };
}

const SHORT_ID = '6f000000-0000-4000-8000-00000000a001';
const LONGER_ID = '6f000000-0000-4000-8000-00000000a002';

/**
 * Background 1's songs, each with one silent recording. The second song's is keyed to a
 * non-primary key, so it only shows up because the view gets the song details (CR PLAY-05).
 */
function gallerySongs(): SongDetail[] {
  const ids = [...new Set(fixtureItems.map((i) => i.songId))];
  return ids.map((songId, n) => {
    const song = getSong(songId);
    const otherKey = song.keys.find((k) => !k.isPrimary) ?? null;
    const recording =
      n === 0
        ? silentRecording(song, SHORT_ID, 'Silent demo (1 s)', SILENT_MP3_SHORT, null)
        : silentRecording(
            song,
            LONGER_ID,
            `Silent demo (1.5 s, ${otherKey?.key ?? 'unkeyed'})`,
            SILENT_MP3_LONGER,
            otherKey?.id ?? null,
          );
    return { ...song, resources: [...song.resources, recording] };
  });
}

const SONGS = gallerySongs();

/** Rows 1 and 2 play the silent recordings; row 3 has none chosen, so it is skipped. */
function galleryItems(): ListItem[] {
  return fixtureItems.map((item, n) => ({
    ...item,
    resourceId: n === 0 ? SHORT_ID : n === 1 ? LONGER_ID : null,
  }));
}

function galleryList(empty: boolean): ListDetail {
  const songsById = new Map(SONGS.map((s) => [s.id, s]));
  const items = empty ? [] : galleryItems();
  return {
    ...fixtureList,
    itemCount: items.length,
    items: items.map((i) => resolveItemDisplay(songsById.get(i.songId)!, i)),
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Fake list actions: succeed (or fail, when asked) after a short delay; nothing is stored. */
function fakeActions(fail: boolean): PlaylistActions {
  async function respond<T>(data: T): Promise<ActionResult<T>> {
    await wait(300);
    if (fail) return { ok: false, error: { code: 'CONFLICT', message: 'Fake server refused.' } };
    return { ok: true, data };
  }
  const items = galleryItems();
  return {
    renameList: () => respond(undefined),
    deleteList: () => respond(undefined),
    removeListItem: () => respond(undefined),
    reorderList: () => respond(undefined),
    updateListItem: (itemId, patch) => {
      const item = items.find((i) => i.id === itemId) ?? items[0]!;
      return respond({ ...item, resourceId: patch.resourceId ?? null });
    },
    getSignedResourceUrl: (resourceId) =>
      respond({
        url: resourceId === SHORT_ID ? SILENT_MP3_SHORT : SILENT_MP3_LONGER,
        expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      }),
  };
}

/**
 * Body of `/dev/playlist`: PlaylistView over the *Background 1* fixture with the real reducer and
 * MP3 adapter playing two silent recordings. Server actions are faked. YouTube rows (pick one of
 * the fixture videos) load the real YouTube player, whose fixture video IDs don't exist.
 */
export function PlaylistGallery() {
  const [view, setView] = useState<View>('editable');
  const [fail, setFail] = useState(false);
  const list = useMemo(() => galleryList(view === 'empty'), [view]);
  const actions = useMemo(() => fakeActions(fail), [fail]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-3 pt-4 sm:px-4">
        <h1 className="text-sm font-medium text-muted-foreground">
          PLAY-05 · PlaylistView with the Background 1 fixture
        </h1>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="flex flex-col gap-1">
            View
            <select
              className="min-h-tap rounded-md border bg-background px-2"
              value={view}
              onChange={(e) => setView(e.target.value as View)}
            >
              {VIEWS.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-tap items-center gap-2">
            <input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} />
            Server actions fail (rollback)
          </label>
        </div>
      </header>

      <PlaylistView
        key={view}
        list={list}
        canEdit={view !== 'read-only'}
        songs={SONGS}
        actions={actions}
      />
      <Toaster />
    </div>
  );
}
