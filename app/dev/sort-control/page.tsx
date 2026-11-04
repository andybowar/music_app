import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isDevGalleryEnabled } from '@/lib/devGallery';

import { SortControlGallery } from './SortControlGallery';

export const metadata: Metadata = { title: 'Dev · sort control' };

export default function SortControlDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <SortControlGallery />;
}
