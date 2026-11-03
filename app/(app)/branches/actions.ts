'use server';
/**
 * Server actions the "Other branches" page calls from the client (BR-02). A thin wrapper over
 * the `getSong` read helper (contracts/api.md), for the row detail panels.
 */
import 'server-only';

import { z } from 'zod';

import { getSong } from '@/features/songs/server/songs';
import { ActionError, withAction } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { assertCan } from '@/lib/permissions';
import type { SongDetail } from '@/types/domain';

const songIdInput = z.string().uuid();

/** One song's full detail for the row panels; NOT_FOUND once it is deleted. */
export const loadBranchSong = withAction(async (id: string): Promise<SongDetail> => {
  const user = await requireUser();
  assertCan(user, 'song:read');
  const song = await getSong(songIdInput.parse(id));
  if (!song) throw new ActionError('NOT_FOUND', 'This song is no longer in the library.');
  return song;
});
