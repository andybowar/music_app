import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isDevGalleryEnabled } from '@/lib/devGallery';

import { SharePageGallery } from './SharePageGallery';

export const metadata: Metadata = { title: 'Dev · share page' };

export default function SharePageDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <SharePageGallery />;
}
