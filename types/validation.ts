import { z } from 'zod';

import {
  CHORD_RE,
  CHORD_SLOTS,
  ENERGY_LEVELS,
  KIND_FORMATS,
  LIST_TYPES,
  MAX_UPLOAD_BYTES,
  MUSICAL_KEY_RE,
  RESOURCE_FORMATS,
  RESOURCE_KINDS,
  SEARCH_FIELDS,
  SECTIONS,
  SORTS,
  TIME_SIGNATURE_RE,
  USAGE_LEVELS,
} from './domain';
import type {
  ChordSlot,
  EnergyLevel,
  ResourceKind,
  SearchField,
  SearchParams,
  Section,
  Sort,
  UsageLevel,
} from './domain';

// ---------- Primitives ----------

/** Any 8-4-4-4-12 hex id (what Postgres `uuid` accepts); not restricted to RFC 4122 versions. */
const uuid = z.guid();
const musicalKey = z.string().regex(MUSICAL_KEY_RE);
const chord = z.string().max(12).regex(CHORD_RE);
const energyLevel = z.enum(ENERGY_LEVELS);
const section = z.enum(SECTIONS);
const resourceKind = z.enum(RESOURCE_KINDS);
const bpm = z.number().int().min(20).max(300);

// ---------- Songs ----------

const lyricsSchema = z.object(
  Object.fromEntries(SECTIONS.map((s) => [s, z.string().max(5000).nullable().optional()])) as {
    [K in Section]: z.ZodOptional<z.ZodNullable<z.ZodString>>;
  },
);

export const songInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    altTitles: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
    composerIds: z.array(uuid).min(1).max(10),
    sourceGroup: z.string().trim().max(100).nullable().default(null),
    year: z.number().int().min(1000).max(2100).nullable().default(null),
    tempoBpm: bpm.nullable().default(null),
    timeSignature: z.string().regex(TIME_SIGNATURE_RE).nullable().default(null),
    energyLevel: energyLevel.nullable().default(null),
    energyNotes: z.string().trim().max(500).nullable().default(null),
    lyrics: lyricsSchema.default({}),
    arrangement: z.array(section).max(30).default([]),
    /** Admin only; the action ignores/forbids it for other roles. Omitted → caller's branch. */
    addedByBranchId: uuid.nullable().optional(),
  })
  .superRefine((input, ctx) => {
    input.arrangement.forEach((s, i) => {
      if (!input.lyrics[s]?.trim()) {
        ctx.addIssue({
          code: 'custom',
          path: ['arrangement', i],
          message: `Arrangement uses ${s}, which has no lyrics`,
        });
      }
    });
  });
export type SongInput = z.infer<typeof songInputSchema>;

const firstChordsSchema = z.object(
  Object.fromEntries(CHORD_SLOTS.map((s) => [s, chord.nullable().optional()])) as {
    [K in ChordSlot]: z.ZodOptional<z.ZodNullable<typeof chord>>;
  },
);

export const songKeyInputSchema = z.object({
  /** Existing `song_keys.id` (echo `SongKey.id` back); omit for a new key. CR LIB-02-song-key-input-id. */
  id: uuid.optional(),
  key: musicalKey,
  isPrimary: z.boolean(),
  firstChords: firstChordsSchema.default({}),
});
export type SongKeyInput = z.infer<typeof songKeyInputSchema>;

export const songKeysInputSchema = z
  .array(songKeyInputSchema)
  .min(1)
  .max(12)
  .superRefine((keys, ctx) => {
    const primaries = keys.filter((k) => k.isPrimary).length;
    if (primaries !== 1) {
      ctx.addIssue({ code: 'custom', message: 'Exactly one key must be primary' });
    }
    const seen = new Set<string>();
    keys.forEach((k, i) => {
      if (seen.has(k.key)) {
        ctx.addIssue({ code: 'custom', path: [i, 'key'], message: `Duplicate key ${k.key}` });
      }
      seen.add(k.key);
    });
    const seenIds = new Set<string>();
    keys.forEach((k, i) => {
      if (k.id === undefined) return;
      if (seenIds.has(k.id)) {
        ctx.addIssue({ code: 'custom', path: [i, 'id'], message: 'Duplicate key id' });
      }
      seenIds.add(k.id);
    });
  });
export type SongKeysInput = z.infer<typeof songKeysInputSchema>;

// ---------- Resources ----------

/** song_key_id is null exactly when kind = 'projection' (schema.md resources check). */
function checkSongKey(
  input: { kind: ResourceKind; songKeyId?: string | null },
  ctx: z.RefinementCtx,
): void {
  const isProjection = input.kind === 'projection';
  if (!isProjection && !input.songKeyId) {
    ctx.addIssue({ code: 'custom', path: ['songKeyId'], message: 'A key is required' });
  }
  if (isProjection && input.songKeyId) {
    ctx.addIssue({
      code: 'custom',
      path: ['songKeyId'],
      message: 'Projection resources are not tied to a key',
    });
  }
}

const resourceLabel = z.string().trim().min(1).max(120);

export const resourceLinkInputSchema = z
  .object({
    songId: uuid,
    songKeyId: uuid.nullable().default(null),
    kind: resourceKind,
    label: resourceLabel,
    url: z.url({ protocol: /^https?$/ }),
  })
  .superRefine((input, ctx) => {
    checkSongKey(input, ctx);
    if (!KIND_FORMATS[input.kind].includes('url')) {
      ctx.addIssue({ code: 'custom', path: ['kind'], message: `${input.kind} cannot be a link` });
    }
  });
export type ResourceLinkInput = z.infer<typeof resourceLinkInputSchema>;

export const uploadRequestSchema = z
  .object({
    songId: uuid,
    songKeyId: uuid.nullable(),
    kind: resourceKind,
    format: z.enum(RESOURCE_FORMATS).exclude(['url']),
    label: resourceLabel,
    sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
    mimeType: z.string().trim().min(1).max(255),
  })
  .superRefine((input, ctx) => {
    checkSongKey(input, ctx);
    if (!KIND_FORMATS[input.kind].includes(input.format)) {
      ctx.addIssue({
        code: 'custom',
        path: ['format'],
        message: `${input.format} is not allowed for ${input.kind}`,
      });
    }
  });
export type UploadRequest = z.infer<typeof uploadRequestSchema>;

// ---------- Themes & usage ----------

export const themeNameSchema = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, ' ').toLowerCase())
  .pipe(z.string().min(1).max(60));

export const usageInputSchema = z
  .array(z.object({ branchId: uuid, level: z.enum(USAGE_LEVELS) }))
  .superRefine((rows, ctx) => {
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      if (seen.has(r.branchId)) {
        ctx.addIssue({ code: 'custom', path: [i, 'branchId'], message: 'Duplicate branch' });
      }
      seen.add(r.branchId);
    });
  });
export type UsageInput = z.infer<typeof usageInputSchema>;

// ---------- Lists ----------

export const listInputSchema = z
  .object({
    type: z.enum(LIST_TYPES),
    name: z.string().trim().min(1).max(120),
    eventDate: z.iso.date().nullable().default(null),
  })
  .superRefine((input, ctx) => {
    if (input.type === 'setlist' && input.eventDate === null) {
      ctx.addIssue({ code: 'custom', path: ['eventDate'], message: 'A setlist needs a date' });
    }
  });
export type ListInput = z.infer<typeof listInputSchema>;

export const listItemPatchSchema = z.object({
  overrideKey: musicalKey.nullable().optional(),
  overrideBpm: bpm.nullable().optional(),
  overrideEnergy: energyLevel.nullable().optional(),
  resourceId: uuid.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type ListItemPatch = z.infer<typeof listItemPatchSchema>;

// ---------- Search params (URL) ----------

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 10_000;
const MAX_Q_LENGTH = 200;
const DEFAULT_USAGE: readonly UsageLevel[] = ['high', 'low', 'rare'];
const BRANCH_CODE_RE = /^[A-Z]{2,3}$/;
const INT_RE = /^\d{1,6}$/;

/** Canonical URL key order (interface order). */
const KEY_ORDER = [
  'q',
  'fields',
  'energy',
  'key',
  'decade',
  'branch',
  'usage',
  'chordChorus',
  'chordVerse',
  'chordBridge',
  'sort',
  'dir',
  'page',
  'pageSize',
] as const satisfies readonly (keyof SearchParams)[];

type RawParams = Map<string, string[]>;

/** Accepts URLSearchParams, a query string, or a Next.js `searchParams` record. */
function toRaw(input: unknown): RawParams {
  const raw: RawParams = new Map();
  const push = (k: string, v: unknown) => {
    if (typeof v !== 'string') return;
    const list = raw.get(k) ?? [];
    list.push(v);
    raw.set(k, list);
  };
  if (input instanceof URLSearchParams) {
    input.forEach((v, k) => push(k, v));
  } else if (typeof input === 'string') {
    new URLSearchParams(input).forEach((v, k) => push(k, v));
  } else if (input !== null && typeof input === 'object') {
    for (const [k, v] of Object.entries(input)) {
      if (Array.isArray(v)) v.forEach((x) => push(k, x));
      else push(k, v);
    }
  }
  return raw;
}

/** All values for a key: repeated keys and comma lists, trimmed, empties removed. */
function listValues(raw: RawParams, key: string): string[] {
  return (raw.get(key) ?? [])
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function firstValue(raw: RawParams, key: string): string | undefined {
  const v = raw.get(key)?.[0]?.trim();
  return v ? v : undefined;
}

/** Keep valid members of an ordered vocabulary, deduped, in vocabulary order. */
function enumList<T extends string>(
  raw: RawParams,
  key: string,
  vocab: readonly T[],
): T[] | undefined {
  const given = new Set(listValues(raw, key));
  const out = vocab.filter((v) => given.has(v));
  return out.length ? out : undefined;
}

/** Keep values matching `valid`, deduped, sorted for a canonical URL. */
function stringList(
  raw: RawParams,
  key: string,
  valid: (v: string) => boolean,
): string[] | undefined {
  const out = [...new Set(listValues(raw, key).filter(valid))].sort();
  return out.length ? out : undefined;
}

function intValue(raw: RawParams, key: string, min: number, max: number): number | undefined {
  const v = firstValue(raw, key);
  if (v === undefined || !INT_RE.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
}

const isChord = (v: string) => v.length <= 12 && CHORD_RE.test(v);
const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

function parseRaw(raw: RawParams): SearchParams {
  const out: SearchParams = {};

  const q = firstValue(raw, 'q')?.slice(0, MAX_Q_LENGTH).trim();
  if (q) out.q = q;

  const fields = enumList<SearchField>(raw, 'fields', SEARCH_FIELDS);
  if (fields && !sameSet(fields, SEARCH_FIELDS)) out.fields = fields;

  const energy = enumList<EnergyLevel>(raw, 'energy', ENERGY_LEVELS);
  if (energy) out.energy = energy;

  const key = stringList(raw, 'key', (v) => MUSICAL_KEY_RE.test(v));
  if (key) out.key = key;

  const decades = [
    ...new Set(
      listValues(raw, 'decade')
        .filter((v) => /^\d{4}$/.test(v))
        .map(Number)
        .filter((n) => n % 10 === 0 && n >= 1000 && n <= 2100),
    ),
  ].sort((a, b) => a - b);
  if (decades.length) out.decade = decades;

  const branch = firstValue(raw, 'branch')?.toUpperCase();
  if (branch && BRANCH_CODE_RE.test(branch)) {
    out.branch = branch;
    // Usage only means something relative to a branch.
    const usage = enumList<UsageLevel>(raw, 'usage', USAGE_LEVELS);
    if (usage && !sameSet(usage, DEFAULT_USAGE)) out.usage = usage;
  }

  const chordChorus = stringList(raw, 'chordChorus', isChord);
  if (chordChorus) out.chordChorus = chordChorus;
  const chordVerse = stringList(raw, 'chordVerse', isChord);
  if (chordVerse) out.chordVerse = chordVerse;
  const chordBridge = stringList(raw, 'chordBridge', isChord);
  if (chordBridge) out.chordBridge = chordBridge;

  const sort = firstValue(raw, 'sort');
  // 'date' is the default only without q; with q the default is relevance, so keep it.
  if (sort && (SORTS as readonly string[]).includes(sort) && !(sort === 'date' && !out.q)) {
    out.sort = sort as Sort;
  }

  const dir = firstValue(raw, 'dir');
  if (dir === 'asc' || dir === 'desc') out.dir = dir;

  const page = intValue(raw, 'page', 1, MAX_PAGE);
  if (page !== undefined && page !== DEFAULT_PAGE) out.page = page;

  const pageSize = intValue(raw, 'pageSize', 1, MAX_PAGE_SIZE);
  if (pageSize !== undefined && pageSize !== DEFAULT_PAGE_SIZE) out.pageSize = pageSize;

  return out;
}

/**
 * Parses URL search params into `SearchParams`. Accepts `URLSearchParams`, a query string
 * (with or without `?`), or a Next.js `searchParams` record. List params may be repeated
 * (`energy=a&energy=b`) or comma-separated (`energy=a,b`). Invalid values are dropped and
 * parsing never fails. Output is normalized: lists deduped and ordered, defaults omitted.
 */
export const searchParamsSchema = z.unknown().transform((input): SearchParams => {
  try {
    return parseRaw(toRaw(input));
  } catch {
    return {};
  }
});

/**
 * Inverse of `searchParamsSchema`: a canonical query string (no leading `?`). Normalizes
 * first, omits defaults, uses comma lists and a fixed key order, so equal searches give
 * equal strings. Returns '' for the default search.
 */
export function serializeSearchParams(p: SearchParams): string {
  const raw: RawParams = new Map();
  for (const k of KEY_ORDER) {
    const v = p[k];
    if (v === undefined) continue;
    raw.set(k, Array.isArray(v) ? [v.join(',')] : [String(v)]);
  }
  const normalized = parseRaw(raw);
  const parts: string[] = [];
  for (const k of KEY_ORDER) {
    const v = normalized[k];
    if (v === undefined) continue;
    const value = Array.isArray(v)
      ? v.map((x) => encodeURIComponent(String(x))).join(',')
      : encodeURIComponent(String(v));
    parts.push(`${k}=${value}`);
  }
  return parts.join('&');
}
