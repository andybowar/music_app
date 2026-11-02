import type { Metadata } from 'next';
import { unstable_rethrow } from 'next/navigation';

import { searchSongs } from '@/features/search/server/search';
import { requirePageUser } from '@/lib/auth';
import { reportError } from '@/lib/log';
import type { SearchResult } from '@/types/domain';

import { QuickLookup } from './QuickLookup';
import { parseQuickQuery, quickHref, quickSearchParams } from './quickQuery';

export const metadata: Metadata = { title: 'Quick theme lookup' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Quick theme lookup (BR-04; REQ-BR-03). The lookup lives in the URL (`?q=…&full=1`); this
 * server page runs the library search over themes + lyrics and hands the result to the
 * client view. A failed search renders the view's error state rather than the route error.
 */
export default async function QuickPage({ searchParams }: Props) {
  const query = parseQuickQuery(await searchParams);
  await requirePageUser(quickHref(query));

  let result: SearchResult | null = null;
  let failed = false;
  if (query.q) {
    try {
      result = await searchSongs(quickSearchParams(query));
    } catch (error) {
      unstable_rethrow(error);
      reportError(error, { handler: 'QuickPage' });
      failed = true;
    }
  }

  return <QuickLookup query={query} result={result} failed={failed} />;
}
