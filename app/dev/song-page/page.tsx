import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { SongPageGallery } from './SongPageGallery';

export const metadata: Metadata = { title: 'Dev · song page' };

export default function SongPageDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <SongPageGallery />;
}
