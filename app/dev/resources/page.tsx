import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { ResourcesGallery } from './ResourcesGallery';

export const metadata: Metadata = { title: 'Dev · resources' };

export default function ResourcesDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <ResourcesGallery />;
}
