import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MediaGallery } from '@/components/media/MediaGallery';
import { isDevGalleryEnabled } from '@/lib/devGallery';

export const metadata: Metadata = { title: 'Dev · media' };

export default function MediaDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <MediaGallery />;
}
