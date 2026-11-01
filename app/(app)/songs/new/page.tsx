import type { Metadata } from 'next';

import { SongForm, SongFormForbidden } from '@/features/songs/ui/SongForm';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

import { loadBranches, songFormActions } from './formData';

export const metadata: Metadata = { title: 'Add a song' };

/** `/songs/new` (LIB-17, REQ-LIB-01): contributors and up add a song. */
export default async function NewSongPage() {
  const user = await requirePageUser('/songs/new');
  if (!can(user, 'song:write')) return <SongFormForbidden />;

  const branches = await loadBranches();
  return <SongForm song={null} user={user} branches={branches} actions={songFormActions} />;
}
