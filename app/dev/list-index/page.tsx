import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isDevGalleryEnabled } from '@/lib/devGallery';

import { ListIndexGallery } from './ListIndexGallery';

export const metadata: Metadata = { title: 'Dev · list index' };

export default function ListIndexDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <ListIndexGallery />;
}
