import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isDevGalleryEnabled } from '@/lib/devGallery';

import { BugReportGallery } from './BugReportGallery';

export const metadata: Metadata = { title: 'Dev · bug report' };

export default function BugReportDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <BugReportGallery />;
}
