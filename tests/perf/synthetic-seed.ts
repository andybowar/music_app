/**
 * Synthetic library for the search benchmark (SRCH-11; REQ-SRCH-07).
 *
 * `generateSyntheticLibrary` is pure and deterministic (seeded PRNG): the same options always
 * give the same rows, so runs are comparable. It builds `count` songs shaped like the real
 * library (titles, alternate titles, lyrics in every section, composers, themes, 1-3 keys with
 * first chords, resources, per-branch usage, a few soft-deleted songs). All text is word salad
 * from the banks below: no real lyrics.
 *
 * `loadSyntheticLibrary` writes it to a database in one transaction; `removeSyntheticLibrary`
 * deletes it again. Everything is scoped so cleanup can't touch anyone else's rows:
 *
 * - song ids start with `SYNTHETIC_ID_PREFIX.song` and composer ids with `.composer`
 *   (keys, resources, theme links and usage rows go with their song via `on delete cascade`);
 * - songs carry `source_group = SYNTHETIC_SOURCE_GROUP`;
 * - theme synonyms are only added when missing, and the loader returns exactly what it added so
 *   `removeSyntheticLibrary` can take those out (and nothing else).
 *
 * Existing themes and branches are reused (passed in by id), never created.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import vocabularyV1 from '@/content/themes-v1.json';
import * as schema from '@/db/schema';
import type {
  EnergyLevel,
  ResourceFormat,
  ResourceKind,
  Section,
  UsageLevel,
} from '@/types/domain';
import { ENERGY_LEVELS, USAGE_LEVELS } from '@/types/domain';

type Db = PostgresJsDatabase<typeof schema>;
type SongRow = typeof schema.songs.$inferInsert;
type ComposerRow = typeof schema.composers.$inferInsert;
type SongComposerRow = typeof schema.songComposers.$inferInsert;
type SongThemeRow = typeof schema.songThemes.$inferInsert;
type SongKeyRow = typeof schema.songKeys.$inferInsert;
type ResourceRow = typeof schema.resources.$inferInsert;
type BranchUsageRow = typeof schema.branchUsage.$inferInsert;

/** First uuid group of every synthetic row, by table. */
export const SYNTHETIC_ID_PREFIX = {
  song: 'ffff0001',
  composer: 'ffff0002',
  key: 'ffff0003',
  resource: 'ffff0004',
} as const;

/** `songs.source_group` of every synthetic song. */
export const SYNTHETIC_SOURCE_GROUP = 'srch-11-perf-synthetic';

/** Deterministic v4-shaped uuid: `<prefix>-0000-4000-8000-<n as 12 hex digits>`. */
export function syntheticId(kind: keyof typeof SYNTHETIC_ID_PREFIX, n: number): string {
  return `${SYNTHETIC_ID_PREFIX[kind]}-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

/** Inclusive uuid range covering every synthetic id of `kind`. */
export function syntheticIdRange(kind: keyof typeof SYNTHETIC_ID_PREFIX): [string, string] {
  const p = SYNTHETIC_ID_PREFIX[kind];
  return [`${p}-0000-0000-0000-000000000000`, `${p}-ffff-ffff-ffff-ffffffffffff`];
}

// ---------------------------------------------------------------------------------------------
// Word banks (invented; not taken from any song)
// ---------------------------------------------------------------------------------------------

export const TITLE_WORDS = [
  'morning',
  'light',
  'river',
  'mountain',
  'crown',
  'song',
  'rising',
  'grace',
  'mercy',
  'glory',
  'shepherd',
  'harbor',
  'fire',
  'wind',
  'open',
  'heaven',
  'joy',
  'hope',
  'anthem',
  'psalm',
  'hallelujah',
  'holy',
  'king',
  'lamb',
  'faithful',
  'everlasting',
  'new',
  'still',
  'waters',
  'refuge',
  'dawn',
  'promise',
  'cornerstone',
  'name',
  'above',
  'all',
  'wonder',
  'great',
  'redeemer',
  'living',
  'hosanna',
  'forever',
  'shine',
  'kingdom',
  'come',
  'alive',
  'strong',
  'tower',
  'fountain',
  'garden',
  'table',
  'home',
  'story',
  'freedom',
  'wonderful',
  'beautiful',
] as const;

export const LYRIC_WORDS = [
  'we',
  'lift',
  'our',
  'hands',
  'you',
  'are',
  'here',
  'in',
  'this',
  'place',
  'sing',
  'praise',
  'to',
  'the',
  'one',
  'who',
  'reigns',
  'over',
  'every',
  'heart',
  'mercy',
  'falls',
  'like',
  'rain',
  'grace',
  'upon',
  'grace',
  'morning',
  'breaks',
  'light',
  'pours',
  'out',
  'river',
  'runs',
  'deep',
  'and',
  'wide',
  'shout',
  'for',
  'joy',
  'stand',
  'firm',
  'on',
  'rock',
  'never',
  'shaken',
  'love',
  'that',
  'will',
  'not',
  'let',
  'go',
  'open',
  'eyes',
  'see',
  'glory',
  'fill',
  'earth',
  'bow',
  'down',
  'all',
  'creation',
  'hope',
  'anchor',
  'soul',
  'peace',
  'like',
  'quiet',
  'sea',
  'name',
  'above',
  'every',
  'name',
  'risen',
  'victorious',
  'lamb',
  'throne',
  'forever',
  'amen',
] as const;

export const COMPOSER_FIRST = [
  'Ada',
  'Bram',
  'Cora',
  'Dell',
  'Esme',
  'Finn',
  'Greta',
  'Hollis',
  'Iris',
  'Jonah',
  'Kit',
  'Lena',
  'Milo',
  'Nora',
  'Otto',
  'Pia',
  'Quinn',
  'Rhea',
  'Silas',
  'Tess',
] as const;

export const COMPOSER_LAST = [
  'Ashford',
  'Brennan',
  'Calloway',
  'Dunmore',
  'Ellery',
  'Fairbank',
  'Galloway',
  'Hartwell',
  'Ingram',
  'Jessop',
  'Kendrick',
  'Larkin',
  'Merriweather',
  'Northcott',
  'Oakes',
  'Pemberton',
  'Quillfeather',
  'Redfern',
  'Stanhope',
  'Thornbury',
] as const;

/** Keys the generator uses; all match `song_keys_key_check` (`^[A-G](#|b)?m?$`). */
export const SYNTHETIC_KEYS = [
  'C',
  'D',
  'E',
  'F',
  'G',
  'A',
  'Bb',
  'Eb',
  'Ab',
  'Db',
  'B',
  'Em',
  'Am',
  'Dm',
  'Bm',
  'F#m',
] as const;
const CHORDS = ['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'Em', 'Am', 'Bm', 'Dm', 'F#m'] as const;
const TIME_SIGNATURES = ['4/4', '4/4', '4/4', '3/4', '6/8', '2/4'] as const;

// ---------------------------------------------------------------------------------------------
// Generator (pure)
// ---------------------------------------------------------------------------------------------

/** mulberry32: small, fast, deterministic PRNG returning floats in [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticOptions {
  /** Songs to generate (REQ-SRCH-07 asks for 5,000). */
  count: number;
  /** Existing branch ids for `added_by_branch_id` and `branch_usage`. */
  branchIds: readonly string[];
  /** Existing theme ids to tag songs with. */
  themeIds: readonly string[];
  /** PRNG seed. Default 11. */
  seed?: number;
  /** "Now" for `created_at` (spread over the 15 years before it). Default 2026-11-01. */
  now?: Date;
}

export interface SyntheticLibrary {
  composers: ComposerRow[];
  songs: SongRow[];
  songComposers: SongComposerRow[];
  songThemes: SongThemeRow[];
  songKeys: SongKeyRow[];
  resources: ResourceRow[];
  branchUsage: BranchUsageRow[];
}

const LYRIC_FIELDS = {
  chorus: 'chorusLyrics',
  verse_1: 'verse1Lyrics',
  verse_2: 'verse2Lyrics',
  verse_3: 'verse3Lyrics',
  verse_4: 'verse4Lyrics',
  verse_5: 'verse5Lyrics',
  bridge: 'bridgeLyrics',
} as const satisfies Record<Section, keyof SongRow>;

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

export function generateSyntheticLibrary(opts: SyntheticOptions): SyntheticLibrary {
  const rng = createRng(opts.seed ?? 11);
  const now = (opts.now ?? new Date('2026-11-01T00:00:00Z')).getTime();
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
  const chance = (p: number) => rng() < p;
  const sample = <T>(xs: readonly T[], n: number): T[] => {
    const copy = [...xs];
    const out: T[] = [];
    while (out.length < n && copy.length > 0)
      out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]!);
    return out;
  };
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  const words = (bank: readonly string[], n: number) => Array.from({ length: n }, () => pick(bank));
  const title = () => words(TITLE_WORDS, int(1, 4)).map(cap).join(' ');
  const lyrics = () =>
    Array.from({ length: int(2, 4) }, () => cap(words(LYRIC_WORDS, int(4, 8)).join(' '))).join(
      '\n',
    );

  const composers: ComposerRow[] = [];
  for (const first of COMPOSER_FIRST) {
    for (const last of COMPOSER_LAST) {
      composers.push({
        id: syntheticId('composer', composers.length + 1),
        name: `${first} ${last}`,
        popMember: chance(0.1) ? pick(['past', 'current'] as const) : 'none',
      });
    }
  }

  const lib: SyntheticLibrary = {
    composers,
    songs: [],
    songComposers: [],
    songThemes: [],
    songKeys: [],
    resources: [],
    branchUsage: [],
  };
  let keyN = 0;
  let resourceN = 0;

  for (let i = 1; i <= opts.count; i++) {
    const id = syntheticId('song', i);
    const createdAt = new Date(now - rng() * 15 * YEAR_MS);
    const verses = int(1, 5);
    const song: SongRow = {
      id,
      title: title(),
      altTitles: chance(0.15) ? [title()] : [],
      year: chance(0.95) ? int(1950, 2026) : null,
      sourceGroup: SYNTHETIC_SOURCE_GROUP,
      tempoBpm: chance(0.9) ? int(50, 160) : null,
      timeSignature: chance(0.9) ? pick(TIME_SIGNATURES) : null,
      energyLevel: chance(0.9) ? pick<EnergyLevel>(ENERGY_LEVELS) : null,
      arrangement: [],
      addedByBranchId: opts.branchIds.length > 0 && chance(0.9) ? pick(opts.branchIds) : null,
      createdAt,
      updatedAt: createdAt,
      deletedAt: chance(0.02) ? new Date(now) : null,
    };
    const sections: Section[] = ['chorus'];
    for (let v = 1; v <= verses; v++) sections.push(`verse_${v}` as Section);
    if (chance(0.7)) sections.push('bridge');
    for (const s of sections) song[LYRIC_FIELDS[s]] = lyrics();
    song.arrangement = sections
      .filter((s) => s !== 'chorus')
      .flatMap((s) => [s, 'chorus' as const]);
    lib.songs.push(song);

    sample(composers, int(1, 3)).forEach((c, sortOrder) =>
      lib.songComposers.push({ songId: id, composerId: c.id!, sortOrder }),
    );
    for (const themeId of sample(opts.themeIds, int(0, 4))) {
      lib.songThemes.push({ songId: id, themeId, section: pick(sections) });
    }

    const keys = sample(SYNTHETIC_KEYS, int(1, 3));
    const keyIds: string[] = [];
    keys.forEach((key, k) => {
      const keyId = syntheticId('key', ++keyN);
      keyIds.push(keyId);
      lib.songKeys.push({
        id: keyId,
        songId: id,
        key,
        isPrimary: k === 0,
        introChord: chance(0.9) ? key : null,
        verseChord: chance(0.9) ? pick(CHORDS) : null,
        chorusChord: chance(0.9) ? pick(CHORDS) : null,
        bridgeChord: chance(0.6) ? pick(CHORDS) : null,
      });
    });

    for (let r = int(0, 8); r > 0; r--) {
      const resId = syntheticId('resource', ++resourceN);
      const roll = rng();
      const songKeyId = pick(keyIds);
      let kind: ResourceKind;
      let format: ResourceFormat;
      let songKey: string | null = songKeyId;
      if (roll < 0.5)
        [kind, format] = [pick(['full_score', 'lead_sheet', 'chord_chart'] as const), 'pdf'];
      else if (roll < 0.7) [kind, format] = ['audio', 'mp3'];
      else if (roll < 0.85) [kind, format] = ['video_link', 'url'];
      else [kind, format, songKey] = ['projection', 'pptx', null];
      const url = format === 'url' ? `https://example.org/watch/${resId}` : null;
      lib.resources.push({
        id: resId,
        songId: id,
        songKeyId: songKey,
        kind,
        format,
        label: `${cap(kind.replace('_', ' '))} ${r}`,
        url,
        storagePath: url ? null : `songs/${id}/${songKey ?? 'common'}/${resId}.${format}`,
        sizeBytes: url ? null : int(10_000, 5_000_000),
        mimeType: url ? null : format === 'pdf' ? 'application/pdf' : 'application/octet-stream',
        createdAt,
      });
    }

    for (const branchId of opts.branchIds) {
      if (chance(0.5)) {
        lib.branchUsage.push({
          songId: id,
          branchId,
          level: pick<UsageLevel>(USAGE_LEVELS),
          source: 'manual',
        });
      }
    }
  }
  return lib;
}

// ---------------------------------------------------------------------------------------------
// Database I/O
// ---------------------------------------------------------------------------------------------

/** Synonyms the loader added; `removeSyntheticLibrary` deletes exactly these. */
export interface LoadedLibrary {
  addedSynonyms: Array<{ themeId: string; synonym: string }>;
}

async function insertChunked<T>(
  rows: readonly T[],
  size: number,
  insert: (chunk: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += size) await insert(rows.slice(i, i + size));
}

/**
 * Writes `lib` in one transaction. Composers whose name already exists (`composers_name_uq` is
 * on `lower(name)`) are reused rather than duplicated. With `withSynonyms`, theme synonyms from
 * the v1 vocabulary are added for existing themes, so queries exercise H-02's expansion; only
 * synonyms not already used anywhere (and that aren't a theme name) are added.
 */
export async function loadSyntheticLibrary(
  db: Db,
  lib: SyntheticLibrary,
  { withSynonyms = true }: { withSynonyms?: boolean } = {},
): Promise<LoadedLibrary> {
  return db.transaction(async (tx) => {
    const s = schema;
    const names = lib.composers.map((c) => c.name.toLowerCase());
    const existing = await tx
      .select({ id: s.composers.id, name: s.composers.name })
      .from(s.composers)
      .where(inArray(sql`lower(${s.composers.name})`, names));
    const reuse = new Map(existing.map((c) => [c.name.toLowerCase(), c.id]));
    const composerId = new Map(
      lib.composers.map((c) => [c.id!, reuse.get(c.name.toLowerCase()) ?? c.id!]),
    );
    const fresh = lib.composers.filter((c) => !reuse.has(c.name.toLowerCase()));
    if (fresh.length > 0) await tx.insert(s.composers).values(fresh);

    await insertChunked(lib.songs, 500, (c) => tx.insert(s.songs).values(c));
    await insertChunked(lib.songKeys, 2000, (c) => tx.insert(s.songKeys).values(c));
    await insertChunked(lib.resources, 2000, (c) => tx.insert(s.resources).values(c));
    await insertChunked(lib.branchUsage, 2000, (c) => tx.insert(s.branchUsage).values(c));
    const links = lib.songComposers.map((l) => ({
      ...l,
      composerId: composerId.get(l.composerId)!,
    }));
    await insertChunked(links, 2000, (c) => tx.insert(s.songComposers).values(c));
    await insertChunked(lib.songThemes, 2000, (c) => tx.insert(s.songThemes).values(c));

    const addedSynonyms: LoadedLibrary['addedSynonyms'] = [];
    if (withSynonyms) {
      const themes = await tx.select({ id: s.themes.id, name: s.themes.name }).from(s.themes);
      const themeByName = new Map(themes.map((t) => [t.name, t.id]));
      const used = new Set(
        (await tx.select({ synonym: s.themeSynonyms.synonym }).from(s.themeSynonyms)).map(
          (r) => r.synonym,
        ),
      );
      const rows: Array<{ themeId: string; synonym: string }> = [];
      for (const entry of vocabularyV1 as Array<{ name: string; synonyms: string[] }>) {
        const themeId = themeByName.get(entry.name);
        if (!themeId) continue;
        for (const synonym of entry.synonyms) {
          if (used.has(synonym) || themeByName.has(synonym)) continue;
          used.add(synonym);
          rows.push({ themeId, synonym });
        }
      }
      if (rows.length > 0) {
        const inserted = await tx
          .insert(s.themeSynonyms)
          .values(rows)
          .onConflictDoNothing()
          .returning({ themeId: s.themeSynonyms.themeId, synonym: s.themeSynonyms.synonym });
        addedSynonyms.push(...inserted);
      }
    }
    return { addedSynonyms };
  });
}

/**
 * Deletes every synthetic song (children cascade) and synthetic composer, plus the synonyms in
 * `loaded`. Safe to call when nothing is loaded. Returns the number of songs removed.
 */
export async function removeSyntheticLibrary(db: Db, loaded?: LoadedLibrary): Promise<number> {
  return db.transaction(async (tx) => {
    const s = schema;
    const [songLo, songHi] = syntheticIdRange('song');
    const [compLo, compHi] = syntheticIdRange('composer');
    const removed = await tx
      .delete(s.songs)
      .where(sql`${s.songs.id} between ${songLo} and ${songHi}`)
      .returning({ id: s.songs.id });
    await tx.delete(s.composers).where(sql`${s.composers.id} between ${compLo} and ${compHi}`);
    for (const { themeId, synonym } of loaded?.addedSynonyms ?? []) {
      await tx
        .delete(s.themeSynonyms)
        .where(and(eq(s.themeSynonyms.themeId, themeId), eq(s.themeSynonyms.synonym, synonym)));
    }
    return removed.length;
  });
}
