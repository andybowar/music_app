import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { AtomsGallery } from './AtomsGallery';

export const metadata: Metadata = { title: 'Dev · atoms' };

export default function AtomsDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <AtomsGallery />;
}
