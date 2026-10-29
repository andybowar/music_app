/**
 * Shared song-form state (contracts/ui.md, "SongFormValue"). Owned by LIB-10; the other form
 * sections (LIB-11 musical, LIB-12 lyrics, LIB-13 themes, LIB-15 usage) and the page that wires
 * them to the server (LIB-17) build on these types. Keep this file free of UI code.
 *
 * Field names and nullability mirror `songInputSchema` / `songKeysInputSchema` /
 * `usageInputSchema` in `@/types/validation`; `types.test.ts` checks that at compile time.
 */
import type {
  Composer,
  EnergyLevel,
  Section,
  SongDetail,
  SongKey,
  SongLyrics,
  Theme,
  UsageLevel,
  UUID,
} from '@/types/domain';

export interface SongFormValue {
  basic: {
    title: string;
    altTitles: string[];
    composers: Composer[];
    sourceGroup: string | null;
    year: number | null;
  };
  musical: {
    keys: Array<Omit<SongKey, 'id' | 'songId'> & { id?: UUID }>;
    tempoBpm: number | null;
    timeSignature: string | null;
    energyLevel: EnergyLevel | null;
    energyNotes: string | null;
  };
  lyrics: { lyrics: Partial<SongLyrics>; arrangement: Section[] };
  themes: Array<{ section: Section; theme: Theme }>;
  usage: Array<{ branchId: UUID; level: UsageLevel }>;
}

export type BasicInfoValue = SongFormValue['basic'];

/**
 * Field errors keyed by dotted path, the same shape as `ActionResult` `fieldErrors`
 * (e.g. `title`, `altTitles.1`, `composerIds`).
 */
export type SongFormErrors = Record<string, string[]>;

/**
 * Props every form section takes (contracts/ui.md). A section calls `onChange` with a patch that
 * replaces the slice(s) it owns wholesale, e.g. `{ basic: nextBasic }`; the parent merges the
 * patch shallowly into its state.
 */
export interface SongFormSectionProps {
  value: Partial<SongFormValue>;
  onChange(v: Partial<SongFormValue>): void;
  errors?: SongFormErrors;
}

/** Limits from `songInputSchema`, so sections can stop input before the server rejects it. */
export const BASIC_LIMITS = {
  titleMax: 200,
  altTitleMax: 200,
  altTitlesMax: 10,
  composersMin: 1,
  composersMax: 10,
  sourceGroupMax: 100,
  yearMin: 1000,
  yearMax: 2100,
} as const;

/** A blank basic-info slice (new song). Returns a fresh object each call. */
export function emptyBasicInfo(): BasicInfoValue {
  return { title: '', altTitles: [], composers: [], sourceGroup: null, year: null };
}

/** The basic-info slice of an existing song (edit form). Copies arrays so edits don't alias. */
export function basicInfoFromSong(
  song: Pick<SongDetail, 'title' | 'altTitles' | 'composers' | 'sourceGroup' | 'year'>,
): BasicInfoValue {
  return {
    title: song.title,
    altTitles: [...song.altTitles],
    composers: song.composers.map((c) => ({ ...c })),
    sourceGroup: song.sourceGroup,
    year: song.year,
  };
}
