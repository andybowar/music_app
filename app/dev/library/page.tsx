import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isDevGalleryEnabled } from '@/lib/devGallery';

import { LibraryGallery } from './LibraryGallery';

export const metadata: Metadata = { title: 'Dev · library' };

export default function LibraryDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <LibraryGallery />;
}
