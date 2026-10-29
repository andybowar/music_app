import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { CreateListGallery } from './CreateListGallery';

export const metadata: Metadata = { title: 'Dev · create-list' };

export default function CreateListDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <CreateListGallery />;
}
