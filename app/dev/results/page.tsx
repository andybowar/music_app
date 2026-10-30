import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { ResultsGallery } from './ResultsGallery';

export const metadata: Metadata = { title: 'Dev · results list' };

export default function ResultsDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <ResultsGallery />;
}
