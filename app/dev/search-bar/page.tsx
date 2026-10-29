import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { SearchBarGallery } from './SearchBarGallery';

export const metadata: Metadata = { title: 'Dev · search bar' };

export default function SearchBarDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <SearchBarGallery />;
}
