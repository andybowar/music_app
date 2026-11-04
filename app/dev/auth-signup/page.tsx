import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isDevGalleryEnabled } from '@/lib/devGallery';

import { AuthSignupGallery } from './AuthSignupGallery';

export const metadata: Metadata = { title: 'Dev · auth signup' };

export default function AuthSignupDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <AuthSignupGallery />;
}
