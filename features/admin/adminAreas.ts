/**
 * Admin dashboard areas (ADM-05). Each area mirrors the permission its own page checks, so the
 * dashboard and the account-menu link never offer a page that would answer 403.
 */
import { can } from '@/lib/permissions';
import type { AppUser } from '@/types/domain';

export const ADMIN_HREF = '/admin';

export type AdminAreaId = 'users' | 'branches' | 'themes' | 'galleries';

export interface AdminArea {
  id: AdminAreaId;
  href: string;
  title: string;
  description: string;
}

const AREAS: ReadonlyArray<AdminArea & { allowed(user: AppUser): boolean }> = [
  {
    id: 'users',
    href: '/admin/users',
    title: 'Users',
    description:
      'Approve access requests, invite people, change roles and branches, disable accounts.',
    allowed: (user) => can(user, 'admin:users'),
  },
  {
    id: 'branches',
    href: '/admin/branches',
    title: 'Branches',
    description: 'Add and rename branches and set the SSO group each one maps to.',
    allowed: (user) => can(user, 'admin:branches'),
  },
  {
    id: 'themes',
    href: '/admin/themes',
    title: 'Themes',
    description: 'Manage the theme vocabulary and the synonyms search uses.',
    // Same check as app/(app)/admin/themes/page.tsx.
    allowed: (user) => can(user, 'theme:merge') && can(user, 'theme:synonyms'),
  },
  {
    id: 'galleries',
    href: '/dev',
    title: 'Component gallery',
    description:
      'Every screen and component with sample data, to check designs and states. No real data.',
    // Same rule as middleware.ts and app/dev/layout.tsx (lib/devGallery): admins only.
    allowed: (user) => can(user, 'admin:users'),
  },
];

/** The admin areas `user` may open, in display order. Empty for members and contributors. */
export function adminAreasFor(user: AppUser): AdminArea[] {
  return AREAS.filter((area) => area.allowed(user)).map(({ allowed: _allowed, ...area }) => area);
}

/** Whether the account menu should offer "Admin" (at least one area is open to `user`). */
export function canSeeAdmin(user: AppUser): boolean {
  return adminAreasFor(user).length > 0;
}
