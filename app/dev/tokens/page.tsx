import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { TokensGallery } from './TokensGallery';

export const metadata: Metadata = { title: 'Dev · tokens' };

export default function TokensDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <TokensGallery />;
}
