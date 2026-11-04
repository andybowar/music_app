import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { ChordsGallery } from './ChordsGallery';

export const metadata: Metadata = { title: 'Dev · chords over lyrics' };

export default function ChordsDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <ChordsGallery />;
}
