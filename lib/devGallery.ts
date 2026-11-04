/**
 * Who may see the `/dev/<component>` galleries (contracts/ui.md).
 *
 * Galleries render fixtures only, so they are open on local dev and on Vercel previews, where
 * PRs are reviewed. On the live deployment (`VERCEL_ENV=production`, not `NODE_ENV`: every
 * Vercel build runs with NODE_ENV=production) only approved admins may open them, from the
 * admin dashboard; everyone else gets a 404. That is enforced twice: `middleware.ts` (every
 * request, including RSC fetches) and `app/dev/layout.tsx`.
 *
 * Every gallery page also calls `if (!isDevGalleryEnabled()) notFound();`. Since the admin
 * check moved to the two gates above, that check passes everywhere.
 */
export function isDevGalleryEnabled(_env: NodeJS.ProcessEnv = process.env): boolean {
  return true;
}

/** True on the live deployment, where galleries are for approved admins only. */
export function isDevGalleryAdminOnly(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV === 'production';
}

/** Whether `pathname` (raw or normalised) is `/dev` or below it. */
export function isDevGalleryPath(normalisedPath: string | null): boolean {
  return (
    normalisedPath !== null && (normalisedPath === '/dev' || normalisedPath.startsWith('/dev/'))
  );
}

/** The row fields the middleware reads to admit an admin to the galleries. */
export interface DevGalleryUserRow {
  access_status: string;
  role: string;
  disabled_at: string | null;
}

/** Whether a `users` row may open the galleries on the live deployment. */
export function mayOpenDevGallery(row: DevGalleryUserRow | null | undefined): boolean {
  return !!row && row.access_status === 'approved' && row.role === 'admin' && !row.disabled_at;
}
