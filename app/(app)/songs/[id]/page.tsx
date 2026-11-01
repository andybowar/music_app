import type { Metadata } from 'next';
import { notFound, unstable_rethrow } from 'next/navigation';
import { cache } from 'react';

import { Toaster } from '@/components/ui/sonner';
import { getSignedResourceUrl } from '@/features/resources/server/files';
import { getSong } from '@/features/songs/server/songs';
import { SongPage, SongPageError } from '@/features/songs/ui/SongPage';
import { requirePageUser } from '@/lib/auth';
import { reportError } from '@/lib/log';
import { can } from '@/lib/permissions';

type Props = { params: Promise<{ id: string }> };

/** One DB read per request, shared by `generateMetadata` and the page. */
const loadSong = cache(getSong);

const songPath = (id: string) => `/songs/${encodeURIComponent(id)}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    await requirePageUser(songPath(id));
    const song = await loadSong(id);
    return { title: song ? song.title : 'Song not found' };
  } catch (error) {
    unstable_rethrow(error);
    return { title: 'Song' };
  }
}

/**
 * Song page (LIB-18; REQ-ROW-03, REQ-ROW-04). Unknown, malformed or soft-deleted ids are a 404
 * (`getSong` returns null for them).
 */
export default async function SongRoute({ params }: Props) {
  const { id } = await params;
  const path = songPath(id);
  const user = await requirePageUser(path);

  let song: Awaited<ReturnType<typeof getSong>>;
  try {
    song = await loadSong(id);
  } catch (error) {
    unstable_rethrow(error);
    reportError(error, { handler: 'SongRoute', songId: id });
    return <SongPageError retryHref={path} />;
  }
  if (!song) notFound();

  return (
    <>
      <SongPage
        song={song}
        canEdit={can(user, 'song:write')}
        canViewHistory={can(user, 'audit:read')}
        getSignedResourceUrl={getSignedResourceUrl}
      />
      <Toaster />
    </>
  );
}
