import 'server-only';

import { cookies } from 'next/headers';

import type { UUID } from '@/types/domain';

import { CURRENT_LIST_COOKIE } from '../currentListCookie';

export { CURRENT_LIST_COOKIE };

/** Any 8-4-4-4-12 hex id (what Postgres `uuid` accepts), matching `types/validation.ts`. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The list id in the `current_list` cookie, or null when the cookie is absent or malformed.
 * Does not check that the list exists or is visible; the caller loads it with the user's
 * permissions and passes `initial={list ?? null}` to `<CurrentListProvider>`.
 */
export async function readCurrentListId(): Promise<UUID | null> {
  const store = await cookies();
  const raw = store.get(CURRENT_LIST_COOKIE)?.value;
  if (!raw) return null;
  let value: string;
  try {
    value = decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
  return UUID_RE.test(value) ? value.toLowerCase() : null;
}
