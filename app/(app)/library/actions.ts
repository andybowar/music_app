'use server';
/**
 * Server actions the Worship Library calls from the client (SRCH-09). Thin wrappers over the
 * read helpers `searchSongs` and `getSong` (contracts/api.md), which also enforce `song:read`.
 */
import 'server-only';

import { z } from 'zod';

import { searchSongs } from '@/features/search/server/search';
import { getSong } from '@/features/songs/server/songs';
import { ActionError, withAction } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { assertCan } from '@/lib/permissions';
import type { SearchResult, SongDetail } from '@/types/domain';
import { searchParamsSchema } from '@/types/validation';

const queryInput = z.string().max(4000);
const songIdInput = z.string().uuid();

/** Another page of library results. `query` is a `serializeSearchParams` string (with `page`). */
export const searchLibraryPage = withAction(async (query: string): Promise<SearchResult> => {
  const user = await requireUser();
  assertCan(user, 'song:read');
  const params = searchParamsSchema.parse(queryInput.parse(query));
  return searchSongs(params);
});

/** One song's full detail for the row panels; NOT_FOUND once it is deleted. */
export const loadSongDetail = withAction(async (id: string): Promise<SongDetail> => {
  const user = await requireUser();
  assertCan(user, 'song:read');
  const song = await getSong(songIdInput.parse(id));
  if (!song) throw new ActionError('NOT_FOUND', 'This song is no longer in the library.');
  return song;
});
