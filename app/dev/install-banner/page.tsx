import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { InstallBannerGallery } from './InstallBannerGallery';

export const metadata: Metadata = { title: 'Dev · install banner' };

export default function InstallBannerDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <InstallBannerGallery />;
}
