import type { SearchField, SearchParams } from '@/types/domain';
import { serializeSearchParams } from '@/types/validation';

/** Fields a quick lookup matches against (BR-04): theme tags and lyrics. */
export const QUICK_FIELDS: readonly SearchField[] = ['themes', 'lyrics'];

/** Results shown before "Show full" (REQ-BR-03: "a dozen matching songs"). */
export const QUICK_TOP = 12;

/** Results shown with "Show full" on: the search's maximum page size. */
export const QUICK_FULL = 100;

export const QUICK_PATH = '/quick';

/** The lookup as it lives in the URL: `/quick?q=grace&full=1`. */
export interface QuickQuery {
  q: string;
  full: boolean;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

/** Reads the page's `searchParams`. Text is trimmed; `full` is on only for `1`. */
export function parseQuickQuery(sp: RawSearchParams | undefined): QuickQuery {
  return { q: first(sp?.q).trim(), full: first(sp?.full) === '1' };
}

/** URL for a lookup. Empty text drops both params, so "clear" is the bare page. */
export function quickHref({ q, full }: QuickQuery): string {
  const text = q.trim();
  if (!text) return QUICK_PATH;
  const qs = new URLSearchParams({ q: text });
  if (full) qs.set('full', '1');
  return `${QUICK_PATH}?${qs.toString()}`;
}

/** The library search for a lookup: themes + lyrics, relevance order, top 12 or 100. */
export function quickSearchParams({ q, full }: QuickQuery): SearchParams {
  return { q, fields: [...QUICK_FIELDS], pageSize: full ? QUICK_FULL : QUICK_TOP };
}

/** The same search on the Worship Library page, for matches beyond what /quick shows. */
export function libraryHref(q: string): string {
  const text = q.trim();
  if (!text) return '/library';
  return `/library?${serializeSearchParams({ q: text, fields: [...QUICK_FIELDS] })}`;
}
