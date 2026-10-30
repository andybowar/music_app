import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { FilterBarGallery } from './FilterBarGallery';

export const metadata: Metadata = { title: 'Dev · filter bar' };

export default function FilterBarDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <FilterBarGallery />;
}
