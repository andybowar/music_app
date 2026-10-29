import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { PlayerGallery } from './PlayerGallery';

export const metadata: Metadata = { title: 'Dev · player' };

export default function PlayerDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <PlayerGallery />;
}
