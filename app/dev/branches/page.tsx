import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isDevGalleryEnabled } from '@/lib/devGallery';

import { BranchesGallery } from './BranchesGallery';

export const metadata: Metadata = { title: 'Dev · branches' };

export default function BranchesDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <BranchesGallery />;
}
