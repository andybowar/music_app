import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { FormMusicalGallery } from './FormMusicalGallery';

export const metadata: Metadata = { title: 'Dev · form musical tags' };

export default function FormMusicalDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <FormMusicalGallery />;
}
