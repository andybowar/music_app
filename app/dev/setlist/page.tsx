import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isDevGalleryEnabled } from '@/lib/devGallery';

import { SetlistGallery } from './SetlistGallery';

export const metadata: Metadata = { title: 'Dev · setlist' };

export default function SetlistDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <SetlistGallery />;
}
