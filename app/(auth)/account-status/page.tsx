import type { Metadata } from 'next';

import { redirect } from 'next/navigation';

import { AccountStatus } from '@/features/auth/ui/AccountStatus';
import { getUser } from '@/lib/auth';

import { AuthShell } from '../login/AuthShell';

export const metadata: Metadata = { title: 'Account status' };

/**
 * `/account-status` (REQ-AUTH-08): where a signed-in pending or rejected user's
 * request stands. `getUser` reads only the signed-in user's own `users` row; no
 * other app data is loaded. Signed-out (or disabled) visitors go to `/login`, and
 * approved users have nothing to wait for, so they go to the library.
 */
export default async function AccountStatusPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  if (user.accessStatus === 'approved') redirect('/library');

  return (
    <AuthShell title="Account status">
      <AccountStatus status={user.accessStatus} name={user.name} email={user.email} />
    </AuthShell>
  );
}
