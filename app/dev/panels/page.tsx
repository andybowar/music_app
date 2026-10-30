import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { PanelsGallery } from './PanelsGallery';

export const metadata: Metadata = { title: 'Dev · panels' };

export default function PanelsDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <PanelsGallery />;
}
