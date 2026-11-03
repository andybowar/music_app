import type { Metadata } from 'next';

import { Toaster } from '@/components/ui/sonner';
import { getSignedResourceUrl } from '@/features/resources/server/files';
import { LibraryView } from '@/features/search/ui/LibraryView';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

import { loadSongDetail, searchLibraryPage } from './actions';
import { libraryPath, loadLibrary, type RawSearchParams } from './loadLibrary';

// Per-user, per-request data (session cookie, URL search): never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Worship Library' };

type Props = { searchParams: Promise<RawSearchParams> };

/**
 * Worship Library (SRCH-09; REQ-NAV-02, REQ-SRCH-01): the Home target. The search comes from
 * the URL; with none this is the default view (newest first, then by title).
 */
export default async function LibraryPage({ searchParams }: Props) {
  const raw = await searchParams;
  const user = await requirePageUser(libraryPath(raw));
  const data = await loadLibrary(raw);

  return (
    <>
      <LibraryView
        {...data}
        searchMore={searchLibraryPage}
        loadSong={loadSongDetail}
        getSignedResourceUrl={getSignedResourceUrl}
        canAddSong={can(user, 'song:write')}
        canEditSongs={can(user, 'song:write')}
      />
      <Toaster />
    </>
  );
}
