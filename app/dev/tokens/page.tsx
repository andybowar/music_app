import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { TokensGallery } from './TokensGallery';

export const metadata: Metadata = { title: 'Dev · tokens' };

export default function TokensDevPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <TokensGallery />;
}
