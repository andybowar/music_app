import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isDevGalleryEnabled } from '@/lib/devGallery';

import { AdminBacklogGallery } from './AdminBacklogGallery';

export const metadata: Metadata = { title: 'Dev · admin backlog' };

export default function AdminBacklogDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <AdminBacklogGallery />;
}
