import 'server-only';

import { asc } from 'drizzle-orm';

import { branches } from '@/db/schema';
import {
  deleteResource,
  finalizeUpload,
  getSignedResourceUrl,
  requestUpload,
} from '@/features/resources/server/files';
import { addLink, updateLink } from '@/features/resources/server/links';
import { createComposer, searchComposers } from '@/features/songs/server/composers';
import { setSongKeys } from '@/features/songs/server/keys';
import { createSong, updateSong } from '@/features/songs/server/songs';
import { setBranchUsage } from '@/features/songs/server/usage';
import type { SongFormActions } from '@/features/songs/ui/SongForm';
import { createTheme, searchThemes, setSongThemes } from '@/features/themes/server';
import { getDb } from '@/lib/db';
import type { Branch } from '@/types/domain';

/**
 * Server actions the song form calls (contracts/api.md), shared by `/songs/new` and
 * `/songs/[id]/edit`. Each one checks its own permission (`song:write`, `usage:write`, …).
 */
export const songFormActions: SongFormActions = {
  createSong,
  updateSong,
  setSongKeys,
  setSongThemes,
  setBranchUsage,
  searchComposers,
  createComposer,
  searchThemes,
  createTheme,
  requestUpload,
  finalizeUpload,
  deleteResource,
  getSignedResourceUrl,
  addLink,
  updateLink,
};

/**
 * Every branch for the usage rows, in the order the song detail lists usage. Callers have
 * already checked `song:write`; branch names and codes aren't sensitive.
 */
export async function loadBranches(): Promise<Branch[]> {
  return getDb()
    .select({
      id: branches.id,
      name: branches.name,
      code: branches.code,
      ssoGroup: branches.ssoGroup,
    })
    .from(branches)
    .orderBy(asc(branches.createdAt), asc(branches.id));
}
