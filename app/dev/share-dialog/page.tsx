import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { ShareDialogGallery } from './ShareDialogGallery';

export const metadata: Metadata = { title: 'Dev · share-dialog' };

export default function ShareDialogDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <ShareDialogGallery />;
}
