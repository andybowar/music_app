# Contract: Domain types

**Status: FROZEN.** Implemented verbatim by task `F-03` in `types/domain.ts` and `types/validation.ts`.
Every other task imports from `@/types/domain` and `@/types/validation`; never redeclare these.
Changes require a change request (see `AGENTS.md` §6).

## types/domain.ts

```ts
// ---------- Enumerations (single source of truth; DB enums mirror these) ----------
export const ROLES = ['member', 'contributor', 'music_leader', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const AUTH_PROVIDERS = ['google', 'microsoft', 'saml', 'password'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];
export const ACCESS_STATUSES = ['pending', 'approved', 'rejected'] as const; // DB-07
export type AccessStatus = (typeof ACCESS_STATUSES)[number];

/** Ordered highest → lowest energy. Sorting by energy uses this index. */
export const ENERGY_LEVELS = ['high_praise', 'high_worship', 'mid_worship', 'deep_worship', 'quiet_worship'] as const;
export type EnergyLevel = (typeof ENERGY_LEVELS)[number];

export const ENERGY_META: Record<EnergyLevel, { label: string; color: string; hex: string }> = {
  high_praise:   { label: "High Energy 'Praise'",  color: 'red',    hex: '#D7263D' },
  high_worship:  { label: "High Energy 'Worship'", color: 'yellow', hex: '#F2B705' },
  mid_worship:   { label: "Mid Energy 'Worship'",  color: 'green',  hex: '#4CAF50' },
  deep_worship:  { label: "Deep 'Worship'",        color: 'purple', hex: '#7B4FA0' },
  quiet_worship: { label: "Quiet 'Worship'",       color: 'blue',   hex: '#3A8FD6' },
};

export const SECTIONS = ['chorus', 'verse_1', 'verse_2', 'verse_3', 'verse_4', 'verse_5', 'bridge'] as const;
export type Section = (typeof SECTIONS)[number];
export const SECTION_LABEL: Record<Section, string> = {
  chorus: 'Chorus', verse_1: 'Verse 1', verse_2: 'Verse 2', verse_3: 'Verse 3',
  verse_4: 'Verse 4', verse_5: 'Verse 5', bridge: 'Bridge',
};

/** Sections that carry a "first chord" on each key. */
export const CHORD_SLOTS = ['intro', 'verse', 'chorus', 'bridge'] as const;
export type ChordSlot = (typeof CHORD_SLOTS)[number];

export const USAGE_LEVELS = ['high', 'low', 'rare', 'none'] as const;
export type UsageLevel = (typeof USAGE_LEVELS)[number];
export const USAGE_SOURCES = ['manual', 'derived'] as const;
export type UsageSource = (typeof USAGE_SOURCES)[number];

export const POP_MEMBER = ['none', 'past', 'current'] as const;
export type PopMember = (typeof POP_MEMBER)[number];

export const RESOURCE_KINDS = [
  'full_score', 'lead_sheet', 'chord_chart', 'audio', 'video_link', 'instruction_link', 'projection',
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_FORMATS = ['pdf', 'mp3', 'm4a', 'pro', 'mdb', 'ppt', 'pptx', 'url'] as const;
export type ResourceFormat = (typeof RESOURCE_FORMATS)[number];

/** Which formats each kind accepts. Upload validation uses this. */
export const KIND_FORMATS: Record<ResourceKind, readonly ResourceFormat[]> = {
  full_score: ['pdf'], lead_sheet: ['pdf'], chord_chart: ['pdf'],
  audio: ['mp3', 'm4a', 'url'], video_link: ['url'], instruction_link: ['url', 'mp3', 'pdf'],
  projection: ['pro', 'mdb', 'ppt', 'pptx', 'url'],
};
/** Kinds stored per key (song_key_id NOT NULL). 'projection' is key-independent. */
export const KEYED_KINDS: readonly ResourceKind[] = ['full_score','lead_sheet','chord_chart','audio','video_link','instruction_link'];

export const LIST_TYPES = ['setlist', 'playlist'] as const;
export type ListType = (typeof LIST_TYPES)[number];

/** Musical key: A–G, optional #/b, optional 'm' for minor. e.g. D, Db, F#m */
export const MUSICAL_KEY_RE = /^[A-G](#|b)?m?$/;
export type MusicalKey = string;
export const MAJOR_KEYS = ['C','Db','D','Eb','E','F','F#','Gb','G','Ab','A','Bb','B'] as const;

/** Chord symbol, loose: root + optional quality/extension/slash bass, max 12 chars. e.g. G, Bm7, D/F# */
export const CHORD_RE = /^[A-G](#|b)?[a-zA-Z0-9+°ø()]*(\/[A-G](#|b)?)?$/;
export const MISSING_CHORD = 'X' as const;

export const TIME_SIGNATURE_RE = /^\d{1,2}\/\d{1,2}$/;

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 3600;

// ---------- Entities (camelCase mirrors of DB rows) ----------
export type UUID = string;
export type ISODate = string;      // 'YYYY-MM-DD'
export type ISODateTime = string;  // RFC 3339

export interface Branch { id: UUID; name: string; code: string; ssoGroup: string | null }

export interface AppUser {
  id: UUID; email: string; name: string; branchId: UUID | null; role: Role;
  authProvider: AuthProvider; disabledAt: ISODateTime | null;
  accessStatus: AccessStatus; // only 'approved' users have any permissions (REQ-AUTH-03)
}

export interface Composer { id: UUID; name: string; popMember: PopMember }

export interface SongKey {
  id: UUID; songId: UUID; key: MusicalKey; isPrimary: boolean;
  firstChords: Record<ChordSlot, string | null>; // null → display MISSING_CHORD
}

export interface Resource {
  id: UUID; songId: UUID; songKeyId: UUID | null; kind: ResourceKind; format: ResourceFormat;
  label: string; url: string | null;        // external link (format 'url')
  storagePath: string | null;               // uploaded file; fetch via getSignedResourceUrl
  sizeBytes: number | null; mimeType: string | null; createdAt: ISODateTime;
}

export interface Theme { id: UUID; name: string }

export type SongLyrics = Record<Section, string | null>;

export interface BranchUsage { branchId: UUID; branchCode: string; level: UsageLevel; source: UsageSource }

/** Compact shape used by SongRow and search results. */
export interface SongSummary {
  id: UUID; title: string; year: number | null;
  tempoBpm: number | null; timeSignature: string | null; energyLevel: EnergyLevel | null;
  primaryKey: MusicalKey | null;
  composers: Array<Pick<Composer, 'name' | 'popMember'>>;
  addedByBranchCode: string | null;
  resourceCount: number;
  createdAt: ISODateTime;
}

/** Full shape used by detail panels, song page, edit form. */
export interface SongDetail extends SongSummary {
  altTitles: string[]; sourceGroup: string | null; energyNotes: string | null;
  composers: Composer[];
  lyrics: SongLyrics; arrangement: Section[];
  chorusLine: string | null; verse1Line: string | null;
  keys: SongKey[];                 // primary first, then alphabetical
  resources: Resource[];           // all, keyed and unkeyed
  themes: Array<{ section: Section; theme: Theme }>;
  usage: BranchUsage[];            // one per branch (missing rows → 'none', source 'manual')
  addedByBranchId: UUID | null; createdBy: UUID | null; updatedAt: ISODateTime;
}

export interface List {
  id: UUID; type: ListType; name: string; eventDate: ISODate | null;
  ownerId: UUID; ownerName: string; branchId: UUID | null; branchCode: string | null;
  itemCount: number; createdAt: ISODateTime; updatedAt: ISODateTime;
}

export interface ListItem {
  id: UUID; listId: UUID; songId: UUID; position: number;
  overrideKey: MusicalKey | null; overrideBpm: number | null; overrideEnergy: EnergyLevel | null;
  resourceId: UUID | null; notes: string | null;
}

/** Output of resolveItemDisplay() — what a setlist row actually shows. */
export interface ResolvedItem {
  item: ListItem; song: SongSummary;
  key: MusicalKey | null; bpm: number | null; energy: EnergyLevel | null;
  isOverridden: { key: boolean; bpm: boolean; energy: boolean };
  firstChords: Record<ChordSlot, string>;   // MISSING_CHORD where unknown
  resources: Resource[];                    // for the effective key + unkeyed
  needsUpload: boolean;                     // override key has no song_keys row
}

export interface ListDetail extends List { items: ResolvedItem[] }

export interface Share { id: UUID; listId: UUID; token: string; expiresAt: ISODateTime | null; revokedAt: ISODateTime | null; createdAt: ISODateTime }

export interface AuditEntry { id: UUID; actorName: string; entity: string; entityId: UUID; action: 'create'|'update'|'delete'; diff: Record<string, { from: unknown; to: unknown }>; createdAt: ISODateTime }

// ---------- Search ----------
export const SEARCH_FIELDS = ['title', 'lyrics', 'themes', 'composer'] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];
export const SORTS = ['date', 'alpha', 'key', 'energy', 'branch_use'] as const;
export type Sort = (typeof SORTS)[number];

export interface SearchParams {
  q?: string;
  fields?: SearchField[];          // default: all four
  energy?: EnergyLevel[];
  key?: MusicalKey[];              // matches ANY song_keys.key, not only primary
  decade?: number[];               // 1990 → 1990..1999
  branch?: string;                 // branch code; with usage
  usage?: UsageLevel[];            // default when branch set: ['high','low','rare']
  chordChorus?: string[]; chordVerse?: string[]; chordBridge?: string[]; // match on primary key's first chords
  sort?: Sort;                     // default 'date' (or relevance when q present and sort unset)
  dir?: 'asc' | 'desc';
  page?: number;                   // 1-based, default 1
  pageSize?: number;               // default 50, max 100
}

export interface SearchResult { items: SongSummary[]; total: number; page: number; pageSize: number; didYouMean?: string }

export interface FacetOptions { keys: MusicalKey[]; decades: number[]; chords: Record<'chorus'|'verse'|'bridge', string[]>; branches: Branch[] }

// ---------- Server action result ----------
export type ErrorCode = 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'RATE_LIMITED' | 'INTERNAL';
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fieldErrors?: Record<string, string[]> } };
```

## types/validation.ts (Zod)

Must export these schemas; inferred types must be assignable to the interfaces above.

| Export | Shape / rules |
|---|---|
| `songInputSchema` | `title` 1–200 chars; `altTitles` ≤10 × ≤200; `composerIds` UUID[] 1..10 (ordered); `sourceGroup` ≤100 nullable; `year` 1000–2100 nullable; `tempoBpm` 20–300 nullable; `timeSignature` matches `TIME_SIGNATURE_RE` nullable; `energyLevel` enum nullable; `energyNotes` ≤500 nullable; `lyrics` partial `SongLyrics`, each ≤5000; `arrangement` Section[] ≤30 and every entry must have non-empty lyrics; `addedByBranchId` UUID nullable (admin only) |
| `songKeyInputSchema` | `id` UUID optional (existing `song_keys.id`; omit for a new key — CR LIB-02-song-key-input-id); `key` matches `MUSICAL_KEY_RE`; `isPrimary` bool; `firstChords` partial record, each matches `CHORD_RE` or null |
| `songKeysInputSchema` | array 1..12 of the above; exactly one `isPrimary`; keys unique; ids (when given) unique |
| `resourceLinkInputSchema` | `songId`, `songKeyId` (required unless kind=projection; must be null for projection), `kind` (must allow `'url'` in `KIND_FORMATS`), `label` 1–120, `url` http(s) |
| `uploadRequestSchema` | `songId`, `songKeyId` nullable, `kind`, `format` allowed by `KIND_FORMATS`, `label`, `sizeBytes` ≤ `MAX_UPLOAD_BYTES`, `mimeType` |
| `themeNameSchema` | trimmed, collapsed whitespace, lowercased, 1–60 chars |
| `usageInputSchema` | array of `{ branchId, level }` |
| `listInputSchema` | `type`, `name` 1–120, `eventDate` ISO date (required for setlist, optional playlist) |
| `listItemPatchSchema` | `overrideKey`, `overrideBpm`, `overrideEnergy`, `resourceId`, `notes` ≤500 — all optional+nullable |
| `searchParamsSchema` | parses `URLSearchParams` → `SearchParams` (repeated keys or comma lists; invalid values dropped, never throws) |
| `serializeSearchParams(p)` | inverse; omits defaults; stable key order → canonical URL |
