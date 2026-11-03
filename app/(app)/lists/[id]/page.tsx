import type { Metadata } from 'next';
import { notFound, unstable_rethrow } from 'next/navigation';
import { cache } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { getList } from '@/features/lists/server/lists';
import { getSongs } from '@/features/songs/server/songs';
import { SetlistView } from '@/features/lists/ui/SetlistView';
import { PlaylistView } from '@/features/player/ui/PlaylistView';
import { requirePageUser } from '@/lib/auth';
import { reportError } from '@/lib/log';
import { can } from '@/lib/permissions';
import type { ListDetail, SongDetail } from '@/types/domain';

import { ListLoadError } from './views';

type Props = { params: Promise<{ id: string }> };

// Per-user, per-request data (session cookie, list permissions).
export const dynamic = 'force-dynamic';

/** One DB read per request, shared by `generateMetadata` and the page. */
const loadList = cache(getList);

const listPath = (id: string) => `/lists/${encodeURIComponent(id)}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    await requirePageUser(listPath(id));
    const list = await loadList(id);
    return { title: list ? list.name : 'List not found' };
  } catch (error) {
    unstable_rethrow(error);
    return { title: 'List' };
  }
}

/**
 * Setlist or playlist (LIST-07; REQ-LIST-03/04/06). Unknown, malformed, soft-deleted and
 * unreadable lists (someone else's playlist) are a 404: `getList` returns null for all of them.
 */
export default async function ListRoute({ params }: Props) {
  const { id } = await params;
  const path = listPath(id);
  const user = await requirePageUser(path);

  let list: ListDetail | null;
  try {
    list = await loadList(id);
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { handler: 'ListRoute', listId: id });
    return <ListLoadError retryHref={path} />;
  }
  if (!list) notFound();

  const canEdit = can(user, 'list:write', { list });

  if (list.type === 'playlist') {
    return (
      <>
        <PlaylistView list={list} canEdit={canEdit} />
        <Toaster />
      </>
    );
  }

  // Song details feed the row panels; the setlist still works without them.
  let songs: SongDetail[] | undefined;
  try {
    songs = await getSongs(list.items.map((i) => i.song.id));
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { handler: 'ListRoute.getSongs', listId: id });
  }

  return (
    <>
      <SetlistView list={list} canEdit={canEdit} songs={songs} />
      <Toaster />
    </>
  );
}
