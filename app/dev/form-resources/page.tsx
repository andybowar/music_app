import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { FormResourcesGallery } from './FormResourcesGallery';

export const metadata: Metadata = { title: 'Dev · form files & links' };

export default function FormResourcesDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <FormResourcesGallery />;
}
