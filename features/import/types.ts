import type {
  ChordSlot,
  EnergyLevel,
  MusicalKey,
  PopMember,
  Section,
  UsageLevel,
} from '@/types/domain';

/** A composer cell entry: `Name`, `Name [past]` or `Name [current]`. */
export interface ImportComposer {
  name: string;
  popMember: PopMember;
}

/** One `usage_<CODE>` cell that had a value. Empty cells are left out (the runner decides). */
export interface ImportUsage {
  branchCode: string;
  level: UsageLevel;
}

/** One validated CSV record, ready for the import runner (IMP-03). */
export interface ImportRow {
  /** 1-based physical line where the record starts (the header is line 1). */
  line: number;
  /** `lower(title)` + `year`, as `"<lower title>|<year or empty>"`. Unique within one parse. */
  idempotencyKey: string;
  title: string;
  altTitles: string[];
  /** In cell order; at least one; unique by lower(name). */
  composers: ImportComposer[];
  sourceGroup: string | null;
  year: number | null;
  primaryKey: MusicalKey | null;
  /** Never includes `primaryKey`; empty when `primaryKey` is null. */
  altKeys: MusicalKey[];
  tempoBpm: number | null;
  timeSignature: string | null;
  energyLevel: EnergyLevel | null;
  energyNotes: string | null;
  /** First chords for the primary key. All null when `primaryKey` is null. */
  firstChords: Record<ChordSlot, string | null>;
  /** Normalized theme names (see `themeNameSchema`) per section, deduped. */
  themes: Record<Section, string[]>;
  usage: ImportUsage[];
  /** Branch code from `added_by`, upper-cased. */
  addedByBranchCode: string | null;
  youtubeLinks: string[];
}

export interface ImportError {
  /** 1-based physical line; 1 for header problems. */
  line: number;
  message: string;
}

export interface ImportParseResult {
  rows: ImportRow[];
  errors: ImportError[];
}

export interface ImportParseOptions {
  /**
   * Known branch codes. When given, `usage_<CODE>` columns and `added_by` values outside this
   * list are reported as errors. When omitted, any well-formed code (2–3 letters) is accepted.
   */
  branchCodes?: readonly string[];
}
