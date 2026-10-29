import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isDevGalleryEnabled } from '@/lib/devGallery';
import { FormLyricsGallery } from './FormLyricsGallery';

export const metadata: Metadata = { title: 'Dev · form lyrics' };

export default function FormLyricsDevPage() {
  if (!isDevGalleryEnabled()) notFound();
  return <FormLyricsGallery />;
}
