import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { FormUsageGallery } from './FormUsageGallery';

export const metadata: Metadata = { title: 'Dev · form branch usage' };

export default function FormUsageDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <FormUsageGallery />;
}
