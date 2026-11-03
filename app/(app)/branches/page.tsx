import type { Metadata } from 'next';

import { Toaster } from '@/components/ui/sonner';
import { BranchesView } from '@/features/branches/ui/BranchesView';
import { addListItem, removeListItem } from '@/features/lists/server/items';
import { createList } from '@/features/lists/server/lists';
import { getSignedResourceUrl } from '@/features/resources/server/files';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

import { loadBranchSong } from './actions';
import { BRANCHES_PATH, loadBranches } from './loadBranches';

// Per-user, per-request data (session cookie, current list cookie): never prerender.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Other branches' };

/**
 * Other branches (BR-02; REQ-BR-01): per-branch cards of recently added songs, upcoming
 * setlists and most-used songs. A failed activity read renders the view's error state rather
 * than the route error.
 */
export default async function BranchesPage() {
  const user = await requirePageUser(BRANCHES_PATH);
  const data = await loadBranches(user);

  return (
    <>
      <BranchesView
        {...data}
        ownBranchId={user.branchId}
        actions={{ addListItem, createList, removeListItem }}
        loadSong={loadBranchSong}
        getSignedResourceUrl={getSignedResourceUrl}
        canEditSongs={can(user, 'song:write')}
      />
      <Toaster />
    </>
  );
}
