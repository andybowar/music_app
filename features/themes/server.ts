'use server';

/**
 * Theme vocabulary (contracts/api.md, REQ-LIB-07).
 *
 * Themes are a shared, normalized vocabulary: a name is stored trimmed, with
 * whitespace collapsed and lowercased (`themeNameSchema`), so "  Glory  Honor "
 * and "glory honor" are the same theme. Songs are tagged per lyric section via
 * `song_themes`; the DB trigger keeps `songs.theme_names` (and search) in sync.
 *
 * - `searchThemes`   read helper for the inline theme picker: prefix, then word
 *                    prefix, then trigram (typo-tolerant) matches.
 * - `createTheme`    idempotent on the normalized name.
 * - `setSongThemes`  replace-all of a song's (section, theme) tags.
 * - `mergeThemes`    moves every tag from `dropId` to `keepId` without duplicates,
 *                    keeps the dropped name as a synonym of the kept theme, then
 *                    deletes the dropped theme.
 */

import 'server-only';

import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { songs, songThemes, themes, themeSynonyms } from '@/db/schema';
import { ActionError, withAction } from '@/lib/action';
import { recordAudit } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { getDb, withTx, type Tx } from '@/lib/db';
import { assertCan } from '@/lib/permissions';
import { SECTIONS, type Section, type Theme } from '@/types/domain';
import { themeNameSchema } from '@/types/validation';

const MAX_LIMIT = 100;
/** Queries shorter than this only use prefix matching; trigrams are noise below it. */
const MIN_FUZZY_LENGTH = 3;
/** `word_similarity` cut-off for fuzzy matches (pg_trgm's plain-similarity default). */
const FUZZY_THRESHOLD = 0.3;

const uuid = z.guid();

const songThemesSchema = z.object({
  songId: uuid,
  entries: z.array(z.object({ section: z.enum(SECTIONS), themeId: uuid })).max(200),
});

const mergeSchema = z.object({ keepId: uuid, dropId: uuid }).refine((v) => v.keepId !== v.dropId, {
  path: ['dropId'],
  message: 'Pick two different themes to merge.',
});

/** Escape LIKE metacharacters (Postgres' default escape character is backslash). */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Normalize a search prefix the same way theme names are stored; never throws. */
function normalizeQuery(prefix: unknown): string {
  if (typeof prefix !== 'string') return '';
  return prefix.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, 60);
}

function clampLimit(limit: unknown): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return 20;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

/**
 * Themes matching `prefix` (case/whitespace-insensitive), best first: names that
 * start with it, then names with a word starting with it, then close spellings
 * (trigram word similarity, for queries of 3+ characters). An empty prefix lists
 * themes alphabetically. Read helper: needs `song:read`; throws `ActionError`
 * when signed out or not allowed.
 */
export async function searchThemes(prefix: string, limit = 20): Promise<Theme[]> {
  const user = await requireUser();
  assertCan(user, 'song:read');
  const q = normalizeQuery(prefix);
  const n = clampLimit(limit);
  const cols = { id: themes.id, name: themes.name };

  if (!q) {
    return getDb().select(cols).from(themes).orderBy(asc(themes.name)).limit(n);
  }

  const escaped = escapeLike(q);
  const startsWith = sql`${themes.name} like ${`${escaped}%`}`;
  const wordStartsWith = sql`${themes.name} like ${`% ${escaped}%`}`;
  const similarity = sql`extensions.word_similarity(${q}, ${themes.name})`;
  const fuzzy = q.length >= MIN_FUZZY_LENGTH ? [sql`${similarity} >= ${FUZZY_THRESHOLD}`] : [];

  return getDb()
    .select(cols)
    .from(themes)
    .where(or(startsWith, wordStartsWith, ...fuzzy))
    .orderBy(desc(startsWith), desc(wordStartsWith), desc(similarity), asc(themes.name))
    .limit(n);
}

/**
 * Create a theme, or return the existing one with the same normalized name.
 * Needs `theme:create`.
 */
export const createTheme = withAction(async (name: string): Promise<Theme> => {
  const user = await requireUser();
  assertCan(user, 'theme:create');
  const normalized = themeNameSchema.parse(name);

  return withTx(async (tx) => {
    const [created] = await tx
      .insert(themes)
      .values({ name: normalized, createdBy: user.id })
      .onConflictDoNothing({ target: themes.name })
      .returning({ id: themes.id, name: themes.name });

    if (created) {
      await recordAudit(tx, {
        actorId: user.id,
        entity: 'theme',
        entityId: created.id,
        action: 'create',
        after: { name: created.name },
      });
      return created;
    }

    const [existing] = await tx
      .select({ id: themes.id, name: themes.name })
      .from(themes)
      .where(eq(themes.name, normalized));
    // Only reachable if the conflicting row was deleted between the two statements.
    if (!existing) throw new ActionError('CONFLICT', 'That theme changed. Please try again.');
    return existing;
  });
});

/** Per-section theme names for each song (sections without themes are omitted). */
async function sectionThemeNames(
  tx: Tx,
  songIds: string[],
): Promise<Map<string, Partial<Record<Section, string[]>>>> {
  const bySong = new Map<string, Partial<Record<Section, string[]>>>();
  for (const id of songIds) bySong.set(id, {});
  if (songIds.length === 0) return bySong;

  const rows = await tx
    .select({ songId: songThemes.songId, section: songThemes.section, name: themes.name })
    .from(songThemes)
    .innerJoin(themes, eq(themes.id, songThemes.themeId))
    .where(inArray(songThemes.songId, songIds))
    .orderBy(asc(themes.name));

  for (const row of rows) {
    const sections = bySong.get(row.songId);
    if (sections) (sections[row.section] ??= []).push(row.name);
  }
  return bySong;
}

/** Audit a change to one song's theme tags, with a per-section diff of names. */
async function auditSongThemes(
  tx: Tx,
  actorId: string,
  songId: string,
  before: Partial<Record<Section, string[]>>,
  after: Partial<Record<Section, string[]>>,
): Promise<void> {
  await recordAudit(tx, {
    actorId,
    entity: 'song_themes',
    entityId: songId,
    action: 'update',
    before,
    after,
  });
}

/**
 * Replace all of a song's theme tags with `entries` (duplicates are ignored).
 * Needs `song:write`. NOT_FOUND for a missing or deleted song; VALIDATION when a
 * theme id doesn't exist (`fieldErrors` keys index into `entries`).
 */
export const setSongThemes = withAction(
  async (songId: string, entries: { section: Section; themeId: string }[]): Promise<void> => {
    const user = await requireUser();
    assertCan(user, 'song:write');
    const input = songThemesSchema.parse({ songId, entries });

    const unique = new Map<string, { section: Section; themeId: string }>();
    for (const e of input.entries) unique.set(`${e.section}:${e.themeId}`, e);
    const rows = [...unique.values()];
    const themeIds = [...new Set(rows.map((r) => r.themeId))];

    await withTx(async (tx) => {
      const [song] = await tx
        .select({ id: songs.id })
        .from(songs)
        .where(and(eq(songs.id, input.songId), isNull(songs.deletedAt)))
        .for('update');
      if (!song) throw new ActionError('NOT_FOUND', 'That song no longer exists.');

      if (themeIds.length > 0) {
        const found = await tx
          .select({ id: themes.id })
          .from(themes)
          .where(inArray(themes.id, themeIds));
        const known = new Set(found.map((t) => t.id));
        const fieldErrors: Record<string, string[]> = {};
        input.entries.forEach((e, i) => {
          if (!known.has(e.themeId)) fieldErrors[`entries.${i}.themeId`] = ['Unknown theme.'];
        });
        if (Object.keys(fieldErrors).length > 0) {
          throw new ActionError('VALIDATION', 'Some themes no longer exist.', fieldErrors);
        }
      }

      const before = (await sectionThemeNames(tx, [song.id])).get(song.id) ?? {};
      await tx.delete(songThemes).where(eq(songThemes.songId, song.id));
      if (rows.length > 0) {
        await tx.insert(songThemes).values(rows.map((r) => ({ songId: song.id, ...r })));
      }
      const after = (await sectionThemeNames(tx, [song.id])).get(song.id) ?? {};
      await auditSongThemes(tx, user.id, song.id, before, after);
    });
  },
);

/**
 * Merge theme `dropId` into `keepId`: every song tagged with the dropped theme is
 * tagged with the kept one in the same section (no duplicates), the dropped name
 * and its synonyms become synonyms of the kept theme, and the dropped theme is
 * deleted. Needs `theme:merge`. NOT_FOUND when either theme is missing.
 */
export const mergeThemes = withAction(async (keepId: string, dropId: string): Promise<void> => {
  const user = await requireUser();
  assertCan(user, 'theme:merge');
  const input = mergeSchema.parse({ keepId, dropId });

  await withTx(async (tx) => {
    const found = await tx
      .select({ id: themes.id, name: themes.name })
      .from(themes)
      .where(inArray(themes.id, [input.keepId, input.dropId]))
      .for('update');
    const keep = found.find((t) => t.id === input.keepId);
    const drop = found.find((t) => t.id === input.dropId);
    if (!keep || !drop) throw new ActionError('NOT_FOUND', 'That theme no longer exists.');

    const affected = await tx
      .selectDistinct({ songId: songThemes.songId })
      .from(songThemes)
      .where(eq(songThemes.themeId, drop.id));
    const songIds = affected.map((r) => r.songId);
    const before = await sectionThemeNames(tx, songIds);

    await tx.execute(sql`
      insert into song_themes (song_id, theme_id, section)
      select song_id, ${keep.id}, section from song_themes where theme_id = ${drop.id}
      on conflict do nothing`);

    const synonyms = await tx
      .select({ synonym: themeSynonyms.synonym })
      .from(themeSynonyms)
      .where(eq(themeSynonyms.themeId, drop.id));
    const carried = [...new Set([drop.name, ...synonyms.map((s) => s.synonym)])].filter(
      (s) => s !== keep.name,
    );
    if (carried.length > 0) {
      await tx
        .insert(themeSynonyms)
        .values(carried.map((synonym) => ({ themeId: keep.id, synonym })))
        .onConflictDoNothing();
    }

    // Cascades to the dropped theme's song_themes and synonyms.
    await tx.delete(themes).where(eq(themes.id, drop.id));

    const after = await sectionThemeNames(tx, songIds);
    for (const songId of songIds) {
      await auditSongThemes(tx, user.id, songId, before.get(songId) ?? {}, after.get(songId) ?? {});
    }
    await recordAudit(tx, {
      actorId: user.id,
      entity: 'theme',
      entityId: drop.id,
      action: 'delete',
      before: { name: drop.name },
      after: { mergedInto: keep.name },
    });
  });
});
