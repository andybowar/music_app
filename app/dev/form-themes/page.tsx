import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { FormThemesGallery } from './FormThemesGallery';

export const metadata: Metadata = { title: 'Dev · form themes' };

export default function FormThemesDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <FormThemesGallery />;
}
