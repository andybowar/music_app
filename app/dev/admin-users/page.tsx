import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isDevGalleryEnabled } from '@/lib/devGallery';

import { AdminUsersGallery } from './AdminUsersGallery';

export const metadata: Metadata = { title: 'Dev · admin users' };

export default function AdminUsersDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <AdminUsersGallery />;
}
