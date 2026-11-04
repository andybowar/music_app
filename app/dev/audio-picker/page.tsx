import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isDevGalleryEnabled } from '@/lib/devGallery';

import { AudioPickerGallery } from './AudioPickerGallery';

export const metadata: Metadata = { title: 'Dev · audio picker' };

export default function AudioPickerDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <AudioPickerGallery />;
}
