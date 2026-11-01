# Contract: Server functions & pure modules

**Status: FROZEN.** Every exported function below has exactly this name, location and signature. UI tasks code against these signatures (using fixtures) before the implementations exist.

Rules for all server actions (`'use server'`):
- Return `ActionResult<T>` (from `@/types/domain`); never throw to the client.
- First line: `const user = await requireUser()` (from `@/lib/auth`), then `assertCan(...)`.
- Validate inputs with the Zod schema named in `contracts/types.md`.
- Mutations write an `audit_log` row via `recordAudit()` (from `@/lib/audit`) for song-related entities.
- Wrap in `withAction(fn)` from `@/lib/action` (maps thrown `ActionError`/Zod errors → `ActionResult`).

Read helpers (non-action, server-only, used by RSC pages) return plain data or `null` and also enforce permissions.

## Core libs

| Module | Exports | Task |
|---|---|---|
| `lib/env.ts` | `env` (Zod-parsed: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `RESEND_API_KEY?`, `SENTRY_DSN?`, `APP_URL`, `CRON_SECRET`, `FEATURE_SAML` bool, `SSO_PROVIDERS` csv) | F-05 |
| `lib/supabase/server.ts` | `createServerSupabase()`, `createServiceSupabase()` | F-05 |
| `lib/supabase/client.ts` | `createBrowserSupabase()` | F-05 |
| `lib/db.ts` | `db` (Drizzle, server-only), `withTx(fn)` | DB-06 |
| `lib/audit.ts` | `recordAudit(tx, { actorId, entity, entityId, action, before?, after? })` computes `diff` | DB-06 |
| `lib/action.ts` | `class ActionError(code, message, fieldErrors?)`, `withAction<A,T>(fn): (...a:A)=>Promise<ActionResult<T>>`, `setSentryCapture(fn: ((error, context?) => void) \| null)` (default: `console.error`; OPS-02 installs it from `instrumentation.ts`) | DB-06 |
| `lib/auth.ts` | `getUser(): Promise<AppUser\|null>` (any access status), `requireUser(): Promise<AppUser>` (approved only: throws UNAUTHENTICATED when signed out, FORBIDDEN when pending/rejected; pages redirect pending/rejected users to `/account-status`), `requireRole(r: Role)` | AUTH-04 |
| `lib/permissions.ts` | `can`, `assertCan`, `Action`, `PermCtx` — see `permissions.md`; `roleAtLeast(role: Role, min: Role): boolean` (member < contributor < music_leader < admin; CR AUTH-04-role-at-least) | AUTH-05 |
| `lib/storage.ts` | `createUploadUrl(path)`, `objectExists(path) → {size}\|null`, `signedReadUrl(path, ttl?)`, `removeObject(path)`, `resourcePath(songId, songKeyId\|null, resourceId, ext)` | LIB-06 |
| `lib/email.ts` | `sendEmail({ to, subject, react })` | SHR-03 |

## Pure modules (no I/O; 100% unit-tested)

```ts
// lib/lyrics/parse.ts  (LIB-16)
/** Splits pasted lyrics on headings like "Verse 1", "V1", "Chorus", "Refrain", "Bridge" (case-insensitive,
 *  optional trailing ':' / brackets). Repeated headings add to arrangement but not duplicate text.
 *  Text before the first heading → verse_1. Unknown headings (Pre-Chorus, Tag) fold into the previous section. */
export function parseLyrics(text: string): { lyrics: Partial<SongLyrics>; arrangement: Section[]; warnings: string[] };
export function firstLine(text: string | null): string | null;

// lib/lists/resolve.ts  (LIST-03)
/** Implements REQ-LIST-04. Effective key = overrideKey ?? primary key. Chords from that key's song_keys row,
 *  else MISSING_CHORD for all slots and needsUpload=true. Resources = keyed resources of effective key + unkeyed. */
export function resolveItemDisplay(song: SongDetail, item: ListItem): ResolvedItem;

// lib/youtube.ts  (LIB-07)
export function parseYouTubeId(url: string): string | null;  // youtu.be, watch?v=, shorts/, embed/

// features/player/engine.ts  (PLAY-01)
export type Track = { id: string; title: string; source: { type: 'mp3'; url: string } | { type: 'youtube'; videoId: string } };
export type PlayerState = { queue: Track[]; index: number; status: 'idle'|'loading'|'playing'|'paused'|'ended' };
export type PlayerEvent =
  | { type: 'LOAD'; queue: Track[]; startIndex?: number } | { type: 'PLAY' } | { type: 'PAUSE' } | { type: 'STOP' }
  | { type: 'NEXT' } | { type: 'PREV' } | { type: 'TRACK_ENDED' } | { type: 'TRACK_READY' } | { type: 'TRACK_ERROR' };
export function playerReducer(s: PlayerState, e: PlayerEvent): PlayerState;   // TRACK_ERROR → skip to next
export interface PlayerAdapter { load(t: Track): Promise<void>; play(): void; pause(): void; stop(): void; onEnded(cb: () => void): void; onError(cb: () => void): void; destroy(): void }
// Adapter semantics (all adapters; CR PLAY-03):
// - onEnded/onError set a single callback; a later call replaces the earlier one.
// - load() rejects on failure and does NOT also call onError; onError is for failures after load resolved.
// - A load() superseded by a newer load() or by destroy() rejects with an Error named 'AbortError'
//   (callers ignore it; it is not a TRACK_ERROR).
// - After destroy(), load() rejects and the other methods are no-ops.
// features/player/adapters/youtube.ts  (PLAY-03)
export function createYouTubeAdapter(opts?: {
  container?: HTMLElement;   // where the iframe mounts; default: compact 200×200 fixed box on document.body
  loadTimeoutMs?: number;    // default 20 000
  scriptTimeoutMs?: number;  // default 15 000
}): PlayerAdapter;         // PLAY-04/05 pass a `container` inside the player bar

// features/import/parse.ts  (IMP-01)
export function parseImportCsv(csv: string): { rows: ImportRow[]; errors: Array<{ line: number; message: string }> };
// features/import/match.ts  (IMP-02)
export function matchFiles(paths: string[], rows: ImportRow[]): { matched: FileMatch[]; unmatched: string[] };
// FileMatch is exported from features/import/match.ts (CR IMP-02); IMP-03 imports it from there.
export interface FileMatch {
  path: string;                       // as given
  idempotencyKey: string;             // matched ImportRow.idempotencyKey
  line: number;                       // matched ImportRow.line
  matchedOn: 'title' | 'alt_title';
  confidence: number;                 // 1 exact (normalized); [0.85, 1) fuzzy
  key: MusicalKey | null;             // null for projection
  keyInRow: boolean;                  // key is the row's primaryKey or in altKeys (true for projection)
  kind: ResourceKind;
  format: ResourceFormat;
  index: number;                      // <n> from "Chord Chart 2"; 1 when absent
  label: string;                      // "Chord Chart", "Chord Chart 2", "Projection"
}

// lib/usage/derive.ts  (BR-03)
export function deriveUsageLevel(setlistCountLast365d: number): UsageLevel; // >=6 high, 2–5 low, 1 rare, 0 none
```

## Server actions & read helpers

| Module | Function | Returns | Perm | Task |
|---|---|---|---|---|
| `features/auth/actions.ts` | `signInWithPassword(email, password)` | `ActionResult<void>` | — | AUTH-01 |
| | `signOut()` / `requestPasswordReset(email)` / `confirmPasswordReset(token, pw)` | `ActionResult<void>` | — | AUTH-01 |
| | `signInWithOidc(provider: 'google'\|'microsoft')` | `ActionResult<{ url }>` | — | AUTH-02 |
| | `signInWithSaml(emailOrDomain)` | `ActionResult<{ url }>` | — | AUTH-03 |
| `features/auth/provision.ts` | `provisionUser(authUser, idpGroups: string[])` (new users are created `pending`, with the group-mapped branch as a suggestion; AUTH-07) | `AppUser` | — | AUTH-02 / AUTH-07 |
| `features/auth/actions.ts` | `signUpWithPassword({ name, email, password })` (creates a `pending` account; never reveals whether the email exists) | `ActionResult<void>` | — | AUTH-07 |
| `features/songs/server/songs.ts` | `createSong(input)` | `ActionResult<{ id }>` | song:write | LIB-01 |
| | `updateSong(id, input)` | `ActionResult<void>` | song:write | LIB-01 |
| | `deleteSong(id)` | `ActionResult<void>` | song:delete | LIB-01 |
| | `getSong(id)` (read helper) | `SongDetail \| null` | song:read | LIB-01 |
| | `getSongs(ids)` (read helper) | `SongDetail[]` | song:read | LIB-01 |
| `features/songs/server/keys.ts` | `setSongKeys(songId, keys)` (replace-all) | `ActionResult<SongKey[]>` | song:write | LIB-02 |
| `features/songs/server/composers.ts` | `searchComposers(prefix)` | `Composer[]` | song:read | LIB-03 |
| | `createComposer(name)` | `ActionResult<Composer>` | composer:create | LIB-03 |
| | `setSongComposers(songId, composerIds)` | `ActionResult<void>` | song:write | LIB-03 |
| | `setComposerPop(id, pop)` / `mergeComposers(keepId, dropId)` | `ActionResult<void>` | composer:merge | LIB-03 |
| `features/themes/server.ts` | `searchThemes(prefix, limit=20)` | `Theme[]` | song:read | LIB-04 |
| | `createTheme(name)` (idempotent on normalized name) | `ActionResult<Theme>` | theme:create | LIB-04 |
| | `setSongThemes(songId, entries: {section, themeId}[])` (replace-all) | `ActionResult<void>` | song:write | LIB-04 |
| | `mergeThemes(keepId, dropId)` / `setThemeSynonyms(id, synonyms)` | `ActionResult<void>` | theme:merge | LIB-04 / H-02 |
| `features/songs/server/usage.ts` | `setBranchUsage(songId, entries: UsageInput)` (replace-all of **manual** rows: each entry is upserted with `source='manual'`; manual rows not in `entries` are deleted; derived rows are kept unless an entry overrides them; `fieldErrors` keys index into `entries`) | `ActionResult<void>` | usage:write | LIB-05 |
| `features/resources/server/files.ts` | `requestUpload(req)` | `ActionResult<{ resourceId, uploadUrl, path }>` | resource:write | LIB-06 |
| | `finalizeUpload(resourceId)` | `ActionResult<Resource>` | resource:write | LIB-06 |
| | `deleteResource(id)` | `ActionResult<void>` | resource:write | LIB-06 |
| | `getSignedResourceUrl(id)` | `ActionResult<{ url, expiresAt }>` | resource:read | LIB-06 |
| `features/resources/server/links.ts` | `addLink(input)` / `updateLink(id, input)` | `ActionResult<Resource>` | resource:write | LIB-07 |
| `features/audit/server.ts` | `getAuditTrail(entity, entityId)` | `AuditEntry[]` | audit:read | LIB-19 |
| `features/search/server/search.ts` | `searchSongs(params)` | `SearchResult` | song:read | SRCH-02 |
| | `getFacetOptions()` | `FacetOptions` | song:read | SRCH-10 |
| `features/search/server/query.ts` | `buildSearchQuery(params)` (internal) | Drizzle SQL | — | SRCH-01 |
| `features/lists/server/lists.ts` | `createList(input)` | `ActionResult<List>` | list:create | LIST-01 |
| | `getList(id)` (read helper) | `ListDetail \| null` | list:read | LIST-01 |
| | `listLists({ type, scope: 'mine'\|'branch'\|'all', upcomingFirst })` | `List[]` | list:read | LIST-01 |
| | `renameList(id, name, eventDate?)` / `deleteList(id)` | `ActionResult<void>` | list:write | LIST-01 |
| `features/lists/server/items.ts` | `addListItem(listId, songId)` (appends) | `ActionResult<ListItem>` | list:write | LIST-02 |
| | `removeListItem(itemId)` / `reorderList(listId, itemIds)` | `ActionResult<void>` | list:write | LIST-02 |
| | `updateListItem(itemId, patch)` | `ActionResult<ListItem>` | list:write | LIST-02 |
| `features/sharing/server.ts` | `createShare(listId, { expiresAt? })` | `ActionResult<Share & { url }>` | share:create | SHR-01 |
| | `revokeShare(id)` / `listShares(listId)` | | share:revoke / list:write | SHR-01 |
| | `getSharedList(token)` (service role) | `ListDetail \| null` (resources stripped of urls/paths) | — | SHR-01 |
| | `sendShareEmail(listId, to: string[])` (≤20 recipients, ≤10 sends/user/hour) | `ActionResult<void>` | share:create | SHR-03 |
| `features/branches/server.ts` | `getBranchActivity({ days = 90 })` | `{ branch: Branch; recentlyAdded: SongSummary[]; upcoming: List[]; topSongs: Array<SongSummary & { count }> }[]` | song:read | BR-01 |
| `features/admin/server.ts` | `inviteUser` (creates an `approved` user), `updateUser(id, { role?, branchId?, disabled? })`, `listUsers({ accessStatus? })`, `upsertBranch` | | admin:* | ADM-01/02 |
| | `approveUser(id, { role, branchId })` / `rejectUser(id)` (sets `access_status`, `access_decided_by/at`; audited; an admin can't decide their own request) | `ActionResult<void>` | admin:* | ADM-01 |
| `app/api/cron/usage/route.ts` | `GET` with `Authorization: Bearer CRON_SECRET` | `{ updated: number }` | cron | BR-03 |

## Import format (IMP-01)

CSV, UTF-8, header row required. Multi-value cells use `;`.

```
title,alt_titles,composers,source_group,year,primary_key,alt_keys,tempo_bpm,time_signature,energy_level,energy_notes,
intro_chord,verse_chord,chorus_chord,bridge_chord,themes_chorus,themes_verse_1,themes_verse_2,themes_verse_3,
themes_verse_4,themes_verse_5,themes_bridge,usage_SV,usage_OR,usage_CO,usage_RF,added_by,youtube_links
```
- `composers`: `Name` or `Name [past]` / `Name [current]` for POP members.
- `usage_<CODE>`: one column per branch code; values high/low/rare/none.
- Idempotency key: `lower(title)` + `year`.

File naming convention for the folder (IMP-02): `<Title> - <Key> - <Kind>[ <n>].<ext>`, e.g. `1000 Hallelujahs - Db - Chord Chart.pdf`, `1000 Hallelujahs - D - Chord Chart 2.pdf`. Projection files: `<Title> - Projection.<pro|mdb|ppt|pptx>`. Kind names map case-insensitively to `resource_kind` (`Full Score`, `Lead Sheet`, `Chord Chart`, `Audio`/`MP3`, `Instruction`).
