import type { Metadata } from 'next';

import { Toaster } from '@/components/ui/sonner';
import {
  approveUser,
  inviteUser,
  listBranchOptions,
  listUsers,
  rejectUser,
  updateUser,
} from '@/features/admin/server';
import { UsersAdmin } from '@/features/admin/ui/users/UsersAdmin';
import { requirePageUser } from '@/lib/auth';
import { can } from '@/lib/permissions';

export const metadata: Metadata = { title: 'Users · Admin' };

/** Admin › Users (ADM-01): user table, invites, and access requests (REQ-AUTH-08). */
export default async function AdminUsersPage() {
  const user = await requirePageUser('/admin/users');

  if (!can(user, 'admin:users')) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm font-medium text-muted-foreground">403</p>
        <h1 className="mt-1 text-xl font-semibold">You don&apos;t have access to this page</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only admins can manage users. Ask an admin if you need a different role.
        </p>
      </div>
    );
  }

  const [users, branches] = await Promise.all([listUsers(), listBranchOptions()]);

  return (
    <div className="mx-auto grid max-w-5xl gap-4 px-4 py-6">
      <h1 className="text-xl font-semibold">Users</h1>
      <UsersAdmin
        users={users}
        branches={branches}
        currentUserId={user.id}
        onInvite={inviteUser}
        onUpdate={updateUser}
        onApprove={approveUser}
        onReject={rejectUser}
      />
      <Toaster />
    </div>
  );
}
