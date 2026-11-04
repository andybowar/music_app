import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { SetPlayerGallery } from './SetPlayerGallery';

export const metadata: Metadata = { title: 'Dev · set player' };

export default function SetPlayerDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <SetPlayerGallery />;
}
