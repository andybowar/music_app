import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { getSong } from '@/features/songs/server/songs';
import { SongForm, SongFormForbidden } from '@/features/songs/ui/SongForm';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

import { loadBranches, songFormActions } from '../../new/formData';

export const metadata: Metadata = { title: 'Edit song' };

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** `/songs/[id]/edit` (LIB-17, REQ-LIB-01). `?created=1` follows a create; `?tab=` opens a tab. */
export default async function EditSongPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requirePageUser(`/songs/${encodeURIComponent(id)}/edit`);
  if (!can(user, 'song:write')) return <SongFormForbidden />;

  const [song, branches] = await Promise.all([getSong(id), loadBranches()]);
  if (!song) notFound();

  const created = first(query.created) === '1';

  return (
    <SongForm
      song={song}
      user={user}
      branches={branches}
      actions={songFormActions}
      initialTab={first(query.tab) ?? (created ? 'files' : 'basic')}
      notice={created ? 'Song added. You can now attach sheet music, audio and links.' : null}
    />
  );
}
