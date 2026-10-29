import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { FormBasicGallery } from './FormBasicGallery';

export const metadata: Metadata = { title: 'Dev · form basic info' };

export default function FormBasicDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <FormBasicGallery />;
}
