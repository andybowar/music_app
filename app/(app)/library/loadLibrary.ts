import 'server-only';

import { unstable_rethrow } from 'next/navigation';

import { getFacetOptions } from '@/features/search/server/facets';
import { searchSongs } from '@/features/search/server/search';
import { reportError } from '@/lib/log';
import type { FacetOptions, SearchResult } from '@/types/domain';
import { searchParamsSchema, serializeSearchParams } from '@/types/validation';

export type RawSearchParams = Record<string, string | string[] | undefined>;

export const LIBRARY_PATH = '/library';

export const SEARCH_ERROR = 'Something went wrong while searching. Please try again.';
export const FACETS_ERROR = 'Filters are unavailable right now.';

/** `/library` plus the canonical form of the search, for the login `next` redirect. */
export function libraryPath(raw: RawSearchParams): string {
  const qs = serializeSearchParams(searchParamsSchema.parse(raw));
  return qs ? `${LIBRARY_PATH}?${qs}` : LIBRARY_PATH;
}

export interface LibraryData {
  result: SearchResult;
  facets: FacetOptions | null;
  facetsError: string | null;
  error: string | null;
}

/**
 * Runs the URL's search and reads the filter options in parallel. A failure in either is
 * reported and turned into a message for the view, so one failing doesn't hide the other.
 */
export async function loadLibrary(raw: RawSearchParams): Promise<LibraryData> {
  const params = searchParamsSchema.parse(raw);
  const [search, facets] = await Promise.allSettled([searchSongs(params), getFacetOptions()]);

  let result: SearchResult;
  let error: string | null = null;
  if (search.status === 'fulfilled') {
    result = search.value;
  } else {
    unstable_rethrow(search.reason);
    reportError(search.reason, { handler: 'LibraryPage', step: 'searchSongs' });
    result = { items: [], total: 0, page: params.page ?? 1, pageSize: params.pageSize ?? 50 };
    error = SEARCH_ERROR;
  }

  if (facets.status === 'fulfilled') {
    return { result, error, facets: facets.value, facetsError: null };
  }
  unstable_rethrow(facets.reason);
  reportError(facets.reason, { handler: 'LibraryPage', step: 'getFacetOptions' });
  return { result, error, facets: null, facetsError: FACETS_ERROR };
}
