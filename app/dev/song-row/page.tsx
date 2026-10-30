import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { SongRowGallery } from './SongRowGallery';

export const metadata: Metadata = { title: 'Dev · song row' };

export default function SongRowDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <SongRowGallery />;
}
