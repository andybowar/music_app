/**
 * Type-level checks: Zod inferred types must be assignable to the domain interfaces.
 * Enforced by `pnpm typecheck`; the runtime test only keeps Vitest from reporting an empty file.
 */
import type { z } from 'zod';

import type {
  BranchUsage,
  ChordSlot,
  List,
  ListItem,
  Resource,
  SearchParams,
  SongDetail,
  SongKey,
  SongLyrics,
} from './domain';
import type {
  listInputSchema,
  listItemPatchSchema,
  resourceLinkInputSchema,
  searchParamsSchema,
  songInputSchema,
  songKeyInputSchema,
  songKeysInputSchema,
  themeNameSchema,
  uploadRequestSchema,
  usageInputSchema,
} from './validation';

type Assert<T extends true> = T;
type Assignable<A, B> = [A] extends [B] ? true : false;
type Out<S extends z.ZodType> = z.output<S>;

export type TypeChecks = [
  Assert<Assignable<Out<typeof searchParamsSchema>, SearchParams>>,
  Assert<
    Assignable<
      Omit<Out<typeof songInputSchema>, 'composerIds' | 'lyrics' | 'addedByBranchId'>,
      Pick<
        SongDetail,
        | 'title'
        | 'altTitles'
        | 'sourceGroup'
        | 'year'
        | 'tempoBpm'
        | 'timeSignature'
        | 'energyLevel'
        | 'energyNotes'
        | 'arrangement'
      >
    >
  >,
  Assert<Assignable<Out<typeof songInputSchema>['lyrics'], Partial<SongLyrics>>>,
  Assert<
    Assignable<
      Out<typeof songInputSchema>['addedByBranchId'],
      SongDetail['addedByBranchId'] | undefined
    >
  >,
  Assert<
    Assignable<
      Out<typeof songKeyInputSchema>,
      Pick<SongKey, 'key' | 'isPrimary'> & {
        firstChords: Partial<Record<ChordSlot, string | null>>;
      }
    >
  >,
  Assert<Assignable<Out<typeof songKeysInputSchema>, Array<Out<typeof songKeyInputSchema>>>>,
  Assert<
    Assignable<
      Out<typeof resourceLinkInputSchema>,
      Pick<Resource, 'songId' | 'songKeyId' | 'kind' | 'label'> & { url: string }
    >
  >,
  Assert<
    Assignable<
      Out<typeof uploadRequestSchema>,
      Pick<Resource, 'songId' | 'songKeyId' | 'kind' | 'format' | 'label'> & {
        sizeBytes: number;
        mimeType: string;
      }
    >
  >,
  Assert<Assignable<Out<typeof themeNameSchema>, string>>,
  Assert<Assignable<Out<typeof usageInputSchema>, Array<Pick<BranchUsage, 'branchId' | 'level'>>>>,
  Assert<Assignable<Out<typeof listInputSchema>, Pick<List, 'type' | 'name' | 'eventDate'>>>,
  Assert<
    Assignable<
      Out<typeof listItemPatchSchema>,
      Partial<
        Pick<ListItem, 'overrideKey' | 'overrideBpm' | 'overrideEnergy' | 'resourceId' | 'notes'>
      >
    >
  >,
];

describe('validation types', () => {
  it('are checked by tsc', () => {
    expect(true).toBe(true);
  });
});
