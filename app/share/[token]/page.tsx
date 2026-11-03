import type { Metadata } from 'next';
import { notFound, unstable_rethrow } from 'next/navigation';
import { cache } from 'react';

import { getSharedList } from '@/features/sharing/server';
import { reportError } from '@/lib/log';
import type { ListDetail } from '@/types/domain';

import { SharedListView } from './SharedListView';
import { toSharedList } from './shared';
import { ShareLoadError } from './views';

type Props = { params: Promise<{ token: string }> };

// Token-gated data that must stop showing the moment a link is revoked or expires: never cache.
export const dynamic = 'force-dynamic';

/** One DB read per request, shared by `generateMetadata` and the page. */
const loadShared = cache(getSharedList);

/**
 * Never indexed or followed, and no `Referer` that would carry the token to another origin.
 * Applied to every outcome (list, 404, error) so they can't be told apart by their headers.
 */
const PRIVATE_META: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  referrer: 'no-referrer',
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  try {
    const list = await loadShared(token);
    return { ...PRIVATE_META, title: list ? list.name : 'Link not available' };
  } catch (error) {
    unstable_rethrow(error);
    return { ...PRIVATE_META, title: 'Shared list' };
  }
}

/**
 * Public read-only list behind a share link (SHR-02; REQ-SHARE-01, REQ-SHARE-03). No session
 * needed (`/share` is a public route in middleware.ts). Malformed, unknown, revoked and expired
 * tokens and deleted lists all get the same 404: `getSharedList` returns null for each.
 */
export default async function SharePage({ params }: Props) {
  const { token } = await params;

  let list: ListDetail | null;
  try {
    list = await loadShared(token);
  } catch (error) {
    unstable_rethrow(error);
    // Never log the token: it is the credential.
    reportError(error, { handler: 'SharePage' });
    return <ShareLoadError />;
  }
  if (!list) notFound();

  return <SharedListView list={toSharedList(list)} />;
}
