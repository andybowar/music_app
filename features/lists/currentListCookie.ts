/**
 * Cookie that remembers the session's current list (REQ-LIST-01). Plain constants with no
 * `'use client'` / `server-only` marker, so both `ui/CurrentList.tsx` and
 * `server/currentList.ts` can import real values (a `'use client'` module's exports are
 * client references on the server, not values).
 */
export const CURRENT_LIST_COOKIE = 'current_list';

/** 12 hours, absolute from when the list was chosen. */
export const CURRENT_LIST_MAX_AGE_SECONDS = 12 * 60 * 60;
