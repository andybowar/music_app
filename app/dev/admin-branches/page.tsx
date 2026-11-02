import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { AdminBranchesGallery } from './AdminBranchesGallery';

export const metadata: Metadata = { title: 'Dev · admin branches' };

export default function AdminBranchesDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <AdminBranchesGallery />;
}
