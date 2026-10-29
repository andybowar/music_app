import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { NavBarGallery } from './NavBarGallery';

export const metadata: Metadata = { title: 'Dev · navbar' };

export default function NavBarDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <NavBarGallery />;
}
