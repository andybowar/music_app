import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { SongHistoryGallery } from './SongHistoryGallery';

export const metadata: Metadata = { title: 'Dev · song history' };

export default function SongHistoryDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <SongHistoryGallery />;
}
