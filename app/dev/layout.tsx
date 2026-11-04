import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { getUser } from '@/lib/auth';
import { isDevGalleryAdminOnly } from '@/lib/devGallery';
import { can } from '@/lib/permissions';

// Reads the session on the live deployment.
export const dynamic = 'force-dynamic';

/**
 * Second gate for the `/dev` galleries (the first is middleware.ts): on the live deployment only
 * approved admins see them; everyone else gets the 404 page. Open on local dev and previews.
 */
export default async function DevLayout({ children }: { children: ReactNode }) {
  if (isDevGalleryAdminOnly()) {
    const user = await getUser();
    if (!user || !can(user, 'admin:users')) notFound();
  }
  return children;
}
