import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { AddToListGallery } from './AddToListGallery';

export const metadata: Metadata = { title: 'Dev · add-to-list' };

export default function AddToListDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <AddToListGallery />;
}
