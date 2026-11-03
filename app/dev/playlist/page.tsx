import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { PlaylistGallery } from './PlaylistGallery';

export const metadata: Metadata = { title: 'Dev · playlist' };

export default function PlaylistDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <PlaylistGallery />;
}
