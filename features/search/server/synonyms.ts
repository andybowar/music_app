/**
 * Theme synonyms (H-02; REQ-LIB-07, REQ-SRCH-02). "honor" also finds songs tagged "glory".
 *
 * `theme_synonyms` maps extra search words to a theme. Three things use it:
 *
 * - **Query expansion** (`expandThemeSynonyms`, used by `buildSearchQuery` when the Themes
 *   field is searched). The parsed query is rewritten with `ts_rewrite`: every part of it
 *   that matches a synonym gets OR'd with the synonym's theme name, labelled with the themes
 *   weight (B) so it only matches theme tags, never titles or lyrics. `honor king` becomes
 *   `king & (honor | glori:B)`. A synonym matches when all its words are in the query
 *   (unquoted words are AND'd, so word order doesn't matter); a quoted phrase is left alone.
 *   Synonyms or theme names that are only stop words never match.
 * - **Admin edits** (`replaceThemeSynonyms`, behind `setThemeSynonyms` in
 *   `features/themes/server.ts`): replace-all of one theme's synonyms. A synonym can't be a
 *   theme name (merge the themes instead) or a synonym of another theme, so one search word
 *   never maps to two themes.
 * - **Vocabulary import** (`applyThemeVocabulary`): adds the themes and synonyms of a
 *   vocabulary file (`content/themes-v1.json`, `THEME_VOCABULARY_V1`) that aren't in the
 *   database yet. Idempotent; nothing is renamed or removed. Synonyms that would break the
 *   rules above are skipped and reported.
 *
 * Merging themes (`mergeThemes`, LIB-04) already keeps the dropped name as a synonym of the
 * kept theme, so merging "honor" into "glory" is all an admin needs for the example above.
 *
 * Server-only. No auth here: callers (actions, pages) check permissions first.
 */
import 'server-only';

import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import vocabularyV1 from '@/content/themes-v1.json';
import { themes, themeSynonyms } from '@/db/schema';
import { ActionError } from '@/lib/action';
import { recordAudit } from '@/lib/audit';
import type { DB, Tx } from '@/lib/db';
import type { UUID } from '@/types/domain';
import { themeNameSchema } from '@/types/validation';

// ---------------------------------------------------------------------------------------------
// Query expansion
// ---------------------------------------------------------------------------------------------

/** Lexemes of a phrase, each labelled with the themes weight: `'god':B <2> 'father':B`. */
const THEME_PHRASE = `pg_catalog.regexp_replace(
      pg_catalog.phraseto_tsquery('english', extensions.unaccent(th.name))::text,
      '''(?:[^'']|'''')*''', '\\&:B', 'g')::tsquery`;

/** Guard so stop-word-only text yields null instead of an empty tsquery and a NOTICE. */
const hasLexemes = (expr: string) =>
  `pg_catalog.length(pg_catalog.to_tsvector('english', extensions.unaccent(${expr}))) > 0`;

/**
 * Rewrite rules for `ts_rewrite(query, rules)`: one `(target, substitute)` row per synonym,
 * where target is the synonym's words (AND'd, `english` config, unaccented like the search
 * vector) and substitute is `target | <theme name>:B`. Fixed SQL text, no user input; it is
 * still sent as a bound parameter.
 */
export const SYNONYM_REWRITE_RULES = `select r.target, r.target || r.theme
from (
  select case when ${hasLexemes('sy.synonym')}
              then pg_catalog.plainto_tsquery('english', extensions.unaccent(sy.synonym)) end as target,
         case when ${hasLexemes('th.name')}
              then ${THEME_PHRASE} end as theme
  from public.theme_synonyms sy
  join public.themes th on th.id = sy.theme_id
) r
where r.target is not null and r.theme is not null`;

/** `query` (a tsquery expression) with theme synonyms expanded to their theme names. */
export function expandThemeSynonyms(query: SQL): SQL {
  return sql`ts_rewrite(${query}, ${SYNONYM_REWRITE_RULES}::text)`;
}

// ---------------------------------------------------------------------------------------------
// Validation (pure)
// ---------------------------------------------------------------------------------------------

export const MAX_SYNONYMS = 50;

/**
 * `setThemeSynonyms` input. Synonyms are normalized like theme names (trimmed, single spaces,
 * lowercase, 1–60 chars). `fieldErrors` keys are `synonyms.<index>` into the input list.
 */
export const themeSynonymsInputSchema = z.object({
  themeId: z.guid(),
  synonyms: z
    .array(themeNameSchema)
    .max(MAX_SYNONYMS, `Up to ${MAX_SYNONYMS} synonyms per theme.`),
});

const vocabularySchema = z.array(
  z.object({ name: themeNameSchema, synonyms: z.array(themeNameSchema) }),
);
export type ThemeVocabulary = z.output<typeof vocabularySchema>;

/** The v1 theme vocabulary (CNT-01), validated. */
export const THEME_VOCABULARY_V1: ThemeVocabulary = vocabularySchema.parse(vocabularyV1);

export interface VocabularyState {
  themes: ReadonlyArray<{ id: UUID; name: string }>;
  synonyms: ReadonlyArray<{ themeId: UUID; synonym: string }>;
}

export interface SkippedSynonym {
  theme: string;
  synonym: string;
  reason: 'theme_name' | 'other_theme';
}

export interface VocabularyPlan {
  /** Theme names to create. */
  newThemes: string[];
  /** Synonyms to add, by theme name. */
  add: Array<{ theme: string; synonym: string }>;
  skipped: SkippedSynonym[];
}

/**
 * What importing `vocabulary` into `state` would change. Pure. A synonym is skipped when it is
 * (or will be) a theme name, or already belongs to (or is claimed earlier in the file by)
 * another theme. Synonyms the theme already has are neither added nor reported.
 */
export function planVocabularyImport(
  vocabulary: ThemeVocabulary,
  state: VocabularyState,
): VocabularyPlan {
  const existing = new Set(state.themes.map((t) => t.name));
  const allNames = new Set([...existing, ...vocabulary.map((e) => e.name)]);
  const nameById = new Map(state.themes.map((t) => [t.id, t.name]));
  /** synonym → theme names that have it. */
  const owners = new Map<string, Set<string>>();
  for (const s of state.synonyms) {
    const owner = nameById.get(s.themeId);
    if (!owner) continue;
    const set = owners.get(s.synonym) ?? new Set<string>();
    set.add(owner);
    owners.set(s.synonym, set);
  }

  const plan: VocabularyPlan = { newThemes: [], add: [], skipped: [] };
  const seenThemes = new Set<string>();
  for (const entry of vocabulary) {
    if (!existing.has(entry.name) && !seenThemes.has(entry.name)) plan.newThemes.push(entry.name);
    seenThemes.add(entry.name);
    for (const synonym of new Set(entry.synonyms)) {
      const has = owners.get(synonym);
      if (has?.has(entry.name)) continue;
      if (allNames.has(synonym)) {
        plan.skipped.push({ theme: entry.name, synonym, reason: 'theme_name' });
      } else if (has && has.size > 0) {
        plan.skipped.push({ theme: entry.name, synonym, reason: 'other_theme' });
      } else {
        plan.add.push({ theme: entry.name, synonym });
        owners.set(synonym, new Set([entry.name]));
      }
    }
  }
  return plan;
}

// ---------------------------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------------------------

/** A theme as the admin page shows it. */
export interface AdminTheme {
  id: UUID;
  name: string;
  /** Sorted. */
  synonyms: string[];
  /** Distinct songs tagged with the theme in any section (soft-deleted songs included). */
  songCount: number;
}

/** Every theme with its synonyms and song count, by name. */
export async function loadAdminThemes(db: DB | Tx): Promise<AdminTheme[]> {
  // Correlated subqueries name the outer column explicitly: Drizzle drops table qualifiers
  // inside sql`` when the query has a single table.
  const rows = await db
    .select({
      id: themes.id,
      name: themes.name,
      synonyms: sql<string[]>`coalesce((
        select array_agg(ts.synonym order by ts.synonym)
        from theme_synonyms ts where ts.theme_id = "themes"."id"), '{}')`,
      songCount: sql<number>`(
        select count(distinct st.song_id)::int
        from song_themes st where st.theme_id = "themes"."id")`,
    })
    .from(themes)
    .orderBy(asc(themes.name));
  return rows.map((r) => ({ ...r, songCount: Number(r.songCount) }));
}

async function synonymsOf(tx: Tx, themeIds: UUID[]): Promise<Map<UUID, string[]>> {
  const map = new Map<UUID, string[]>(themeIds.map((id) => [id, []]));
  if (themeIds.length === 0) return map;
  const rows = await tx
    .select({ themeId: themeSynonyms.themeId, synonym: themeSynonyms.synonym })
    .from(themeSynonyms)
    .where(inArray(themeSynonyms.themeId, themeIds))
    .orderBy(asc(themeSynonyms.synonym));
  for (const r of rows) map.get(r.themeId)?.push(r.synonym);
  return map;
}

async function auditSynonyms(
  tx: Tx,
  actorId: UUID,
  themeId: UUID,
  before: string[],
  after: string[],
): Promise<void> {
  await recordAudit(tx, {
    actorId,
    entity: 'theme',
    entityId: themeId,
    action: 'update',
    before: { synonyms: before },
    after: { synonyms: after },
  });
}

/**
 * Replace all synonyms of `themeId` with `synonyms` (already normalized by
 * `themeSynonymsInputSchema`) and audit the change. Duplicates and the theme's own name are
 * dropped silently.
 * NOT_FOUND for a missing theme; VALIDATION (keys `synonyms.<index>`) for a synonym that is
 * another theme's name or another theme's synonym.
 */
export async function replaceThemeSynonyms(
  tx: Tx,
  actorId: UUID,
  themeId: UUID,
  synonyms: string[],
): Promise<void> {
  const [theme] = await tx
    .select({ id: themes.id, name: themes.name })
    .from(themes)
    .where(eq(themes.id, themeId))
    .for('update');
  if (!theme) throw new ActionError('NOT_FOUND', 'That theme no longer exists.');

  const wanted = [...new Set(synonyms)].filter((s) => s !== theme.name).sort();
  if (wanted.length > 0) {
    const names = await tx
      .select({ name: themes.name })
      .from(themes)
      .where(inArray(themes.name, wanted));
    const taken = await tx
      .select({ synonym: themeSynonyms.synonym, theme: themes.name })
      .from(themeSynonyms)
      .innerJoin(themes, eq(themes.id, themeSynonyms.themeId))
      .where(inArray(themeSynonyms.synonym, wanted));
    const themeNames = new Set(names.map((n) => n.name));
    const otherOwner = new Map(
      taken.filter((t) => t.theme !== theme.name).map((t) => [t.synonym, t.theme]),
    );
    const fieldErrors: Record<string, string[]> = {};
    synonyms.forEach((s, i) => {
      if (themeNames.has(s)) {
        fieldErrors[`synonyms.${i}`] = [`"${s}" is a theme. Merge it instead.`];
      } else if (otherOwner.has(s)) {
        fieldErrors[`synonyms.${i}`] = [`"${s}" is already a synonym of "${otherOwner.get(s)}".`];
      }
    });
    if (Object.keys(fieldErrors).length > 0) {
      throw new ActionError('VALIDATION', 'Some synonyms are already in use.', fieldErrors);
    }
  }

  const before = (await synonymsOf(tx, [theme.id])).get(theme.id) ?? [];
  const keep = new Set(wanted);
  const removed = before.filter((s) => !keep.has(s));
  const added = wanted.filter((s) => !before.includes(s));
  if (removed.length === 0 && added.length === 0) return;

  if (removed.length > 0) {
    await tx
      .delete(themeSynonyms)
      .where(and(eq(themeSynonyms.themeId, theme.id), inArray(themeSynonyms.synonym, removed)));
  }
  if (added.length > 0) {
    await tx
      .insert(themeSynonyms)
      .values(added.map((synonym) => ({ themeId: theme.id, synonym })))
      .onConflictDoNothing();
  }
  await auditSynonyms(tx, actorId, theme.id, before, wanted);
}

export interface VocabularyImportResult {
  themesCreated: number;
  synonymsAdded: number;
  skipped: SkippedSynonym[];
}

/**
 * Import `vocabulary` (see `planVocabularyImport`): create missing themes, add missing
 * synonyms, audit each created theme and each theme whose synonyms changed. Idempotent.
 */
export async function applyThemeVocabulary(
  tx: Tx,
  actorId: UUID,
  vocabulary: ThemeVocabulary,
): Promise<VocabularyImportResult> {
  // Serialize imports so two runs can't both plan the same synonym for different themes.
  await tx.execute(sql`lock table theme_synonyms in share row exclusive mode`);
  const stateThemes = await tx.select({ id: themes.id, name: themes.name }).from(themes);
  const stateSynonyms = await tx
    .select({ themeId: themeSynonyms.themeId, synonym: themeSynonyms.synonym })
    .from(themeSynonyms);
  const plan = planVocabularyImport(vocabulary, {
    themes: stateThemes,
    synonyms: stateSynonyms,
  });

  let themesCreated = 0;
  if (plan.newThemes.length > 0) {
    const created = await tx
      .insert(themes)
      .values(plan.newThemes.map((name) => ({ name, createdBy: actorId })))
      .onConflictDoNothing({ target: themes.name })
      .returning({ id: themes.id, name: themes.name });
    themesCreated = created.length;
    for (const t of created) {
      await recordAudit(tx, {
        actorId,
        entity: 'theme',
        entityId: t.id,
        action: 'create',
        after: { name: t.name },
      });
    }
  }

  if (plan.add.length === 0) return { themesCreated, synonymsAdded: 0, skipped: plan.skipped };

  const names = [...new Set(plan.add.map((a) => a.theme))];
  const ids = await tx
    .select({ id: themes.id, name: themes.name })
    .from(themes)
    .where(inArray(themes.name, names));
  const idByName = new Map(ids.map((t) => [t.name, t.id]));
  const rows = plan.add.flatMap((a) => {
    const themeId = idByName.get(a.theme);
    return themeId ? [{ themeId, synonym: a.synonym }] : [];
  });
  const touched = [...new Set(rows.map((r) => r.themeId))];
  const before = await synonymsOf(tx, touched);
  const inserted = await tx
    .insert(themeSynonyms)
    .values(rows)
    .onConflictDoNothing()
    .returning({ themeId: themeSynonyms.themeId });
  const after = await synonymsOf(tx, touched);
  for (const themeId of new Set(inserted.map((r) => r.themeId))) {
    await auditSynonyms(tx, actorId, themeId, before.get(themeId) ?? [], after.get(themeId) ?? []);
  }
  return { themesCreated, synonymsAdded: inserted.length, skipped: plan.skipped };
}
