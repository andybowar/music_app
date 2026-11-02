import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { SongFormGallery } from './SongFormGallery';

export const metadata: Metadata = { title: 'Dev · song form' };

export default function SongFormDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <SongFormGallery />;
}
