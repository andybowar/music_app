import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isDevGalleryEnabled } from '@/lib/devGallery';

import { QuickGallery } from './QuickGallery';

export const metadata: Metadata = { title: 'Dev · quick lookup' };

export default function QuickDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <QuickGallery />;
}
