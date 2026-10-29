/**
 * Typed sample data (F-04) so UI and logic tasks can work before the backend exists.
 * Everything here is invented except the real songs' titles, composers, years and first lines.
 * The JSON is parsed through strict schemas on import, so a malformed fixture fails loudly.
 */
import type {
  AppUser,
  Branch,
  Composer,
  List,
  ListItem,
  Resource,
  SongDetail,
  SongSummary,
  Theme,
  UUID,
} from '@/types/domain';

import branchesJson from './branches.json';
import listsJson from './lists.json';
import {
  appUserSchema,
  branchSchema,
  listsFileSchema,
  songDetailSchema,
  themeSchema,
} from './schemas';
import songsJson from './songs.json';
import themesJson from './themes.json';
import usersJson from './users.json';

export const branches: Branch[] = branchSchema.array().parse(branchesJson);
export const users: AppUser[] = appUserSchema.array().parse(usersJson);
export const themes: Theme[] = themeSchema.array().parse(themesJson);
export const songs: SongDetail[] = songDetailSchema.array().parse(songsJson);

const parsedLists = listsFileSchema.parse(listsJson);
export const lists: List[] = parsedLists.lists;
export const listItems: ListItem[] = parsedLists.items;

/** Every composer referenced by a song, deduped by id, in first-seen order. */
export const composers: Composer[] = [
  ...new Map(songs.flatMap((s) => s.composers).map((c) => [c.id, c])).values(),
];

/** Every resource across all songs. */
export const resources: Resource[] = songs.flatMap((s) => s.resources);

/** The compact row shape of a song, derived exactly as `SongSummary` defines it. */
export function toSummary(detail: SongDetail): SongSummary {
  return {
    id: detail.id,
    title: detail.title,
    year: detail.year,
    tempoBpm: detail.tempoBpm,
    timeSignature: detail.timeSignature,
    energyLevel: detail.energyLevel,
    primaryKey: detail.keys.find((k) => k.isPrimary)?.key ?? null,
    composers: detail.composers.map(({ name, popMember }) => ({ name, popMember })),
    addedByBranchCode: detail.addedByBranchCode,
    resourceCount: detail.resources.length,
    createdAt: detail.createdAt,
  };
}

export const songSummaries: SongSummary[] = songs.map(toSummary);

function byId<T extends { id: UUID }>(rows: readonly T[], id: UUID, what: string): T {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`No ${what} fixture with id ${id}`);
  return row;
}

export const getSong = (id: UUID): SongDetail => byId(songs, id, 'song');
export const getList = (id: UUID): List => byId(lists, id, 'list');
export const getBranch = (id: UUID): Branch => byId(branches, id, 'branch');
export const getItemsForList = (listId: UUID): ListItem[] =>
  listItems.filter((i) => i.listId === listId).sort((a, b) => a.position - b.position);

/** Well-known fixtures, named so tests and `/dev` pages don't hard-code ids. */
export const SONG_IDS = {
  thousandHallelujahs: '40000000-0000-4000-8000-000000000001',
  tenThousandReasons: '40000000-0000-4000-8000-000000000002',
  agnusDei: '40000000-0000-4000-8000-000000000003',
  causeToCelebrate: '40000000-0000-4000-8000-000000000004',
  beTheCenter: '40000000-0000-4000-8000-000000000005',
  theLordAlmightyReigns: '40000000-0000-4000-8000-000000000006',
  lordYouAreWorthy: '40000000-0000-4000-8000-000000000007',
  reviveThisLand: '40000000-0000-4000-8000-000000000008',
  holySpirit: '40000000-0000-4000-8000-000000000009',
  amazingGrace: '40000000-0000-4000-8000-000000000010',
  atTheCross: '40000000-0000-4000-8000-000000000011',
  beExaltedOGod: '40000000-0000-4000-8000-000000000012',
} as const satisfies Record<string, UUID>;

export const LIST_IDS = {
  bg41926: '80000000-0000-4000-8000-000000000001',
  ag42526: '80000000-0000-4000-8000-000000000002',
  background1: '80000000-0000-4000-8000-000000000003',
} as const satisfies Record<string, UUID>;

export const BRANCH_IDS = {
  servant: '10000000-0000-4000-8000-000000000001',
  portland: '10000000-0000-4000-8000-000000000002',
  coSprings: '10000000-0000-4000-8000-000000000003',
  rockford: '10000000-0000-4000-8000-000000000004',
} as const satisfies Record<string, UUID>;

/** Ready-made `SongDetail` for "A Thousand Hallelujahs" (Diagram I). */
export const thousandHallelujahs: SongDetail = getSong(SONG_IDS.thousandHallelujahs);
