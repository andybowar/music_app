import type { Metadata } from 'next';

import { Toaster } from '@/components/ui/sonner';
import { deleteBranch, listBranches, upsertBranch } from '@/features/admin/server';
import { BranchesAdmin } from '@/features/admin/ui/branches/BranchesAdmin';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const metadata: Metadata = { title: 'Branches · Admin' };

/** Admin › Branches (ADM-02): names, codes and SSO group mapping. */
export default async function AdminBranchesPage() {
  const user = await requirePageUser('/admin/branches');

  if (!can(user, 'admin:branches')) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm font-medium text-muted-foreground">403</p>
        <h1 className="mt-1 text-xl font-semibold">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only admins can manage branches. Ask an admin if you need a different role.
        </p>
      </div>
    );
  }

  const branches = await listBranches();

  return (
    <div className="mx-auto grid max-w-5xl gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Branches</h1>
      <BranchesAdmin branches={branches} onSave={upsertBranch} onDelete={deleteBranch} />
      <Toaster />
    </div>
  );
}
