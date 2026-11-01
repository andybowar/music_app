/**
 * Song form ↔ server actions (LIB-17). Pure: no React, no I/O of its own.
 *
 * - `emptySongFormValue` / `songFormValueFromSong`: the form's starting value.
 * - `toSongInput`, `toKeysInput`, `toThemeEntries`, `toUsageInput`: `SongFormValue` → the inputs of
 *   `createSong`/`updateSong`, `setSongKeys`, `setSongThemes` and `setBranchUsage`
 *   (contracts/api.md). Composers travel inside the song input as `composerIds` (LIB-01 writes
 *   them in the same transaction), so `setSongComposers` isn't called separately.
 * - `validateSongForm`: the client-side check run before saving.
 * - `saveSong`: runs the actions in order and maps every failure onto form field paths.
 * - `tabForErrorKey`: which form tab shows a given error.
 */
import type { ActionResult, Section, SongDetail, SongKey, UUID } from '@/types/domain';
import { SECTIONS } from '@/types/domain';
import type { SongInput, SongKeyInput, UsageInput } from '@/types/validation';

import { emptyLyrics, lyricsFromSong } from './LyricsSection';
import { emptyMusicalInfo, musicalInfoFromSong, validateMusical } from './MusicalSection';
import {
  basicInfoFromSong,
  emptyBasicInfo,
  type SongFormErrors,
  type SongFormValue,
} from './types';
import { usageFromSong } from './UsageSection';

// ---------- Starting values ----------

/** A blank form (new song). */
export function emptySongFormValue(): SongFormValue {
  return {
    basic: emptyBasicInfo(),
    musical: emptyMusicalInfo(),
    lyrics: emptyLyrics(),
    themes: [],
    usage: [],
  };
}

/** The form value of an existing song (edit form). Usage holds manual rows only. */
export function songFormValueFromSong(song: SongDetail): SongFormValue {
  return {
    basic: basicInfoFromSong(song),
    musical: musicalInfoFromSong(song),
    lyrics: lyricsFromSong(song),
    themes: song.themes.map((t) => ({ section: t.section, theme: { ...t.theme } })),
    usage: usageFromSong(song),
  };
}

// ---------- Form value → action inputs ----------

/** Trimmed text, or null when it is empty. */
const textOrNull = (v: string | null | undefined): string | null => {
  const trimmed = v?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

/**
 * `createSong` / `updateSong` input. `addedByBranchId` is left out, so the server keeps the
 * creator's branch (REQ-LIB-04); only admins may change it and this form doesn't offer that.
 */
export function toSongInput(value: SongFormValue): SongInput {
  const { basic, musical, lyrics } = value;
  const text: Partial<Record<Section, string | null>> = {};
  for (const s of SECTIONS) {
    const raw = lyrics.lyrics[s];
    // Keep the text as typed (line breaks matter); blank sections are stored as null.
    text[s] = raw && raw.trim() !== '' ? raw : null;
  }
  return {
    title: basic.title.trim(),
    altTitles: basic.altTitles.map((t) => t.trim()).filter((t) => t !== ''),
    composerIds: basic.composers.map((c) => c.id),
    sourceGroup: textOrNull(basic.sourceGroup),
    year: basic.year,
    tempoBpm: musical.tempoBpm,
    timeSignature: textOrNull(musical.timeSignature),
    energyLevel: musical.energyLevel,
    energyNotes: textOrNull(musical.energyNotes),
    lyrics: text,
    arrangement: [...lyrics.arrangement],
  };
}

/** `setSongKeys` input, in form order. Existing keys echo their id so renames keep resources. */
export function toKeysInput(keys: SongFormValue['musical']['keys']): SongKeyInput[] {
  return keys.map((k) => ({
    ...(k.id ? { id: k.id } : {}),
    key: k.key,
    isPrimary: k.isPrimary,
    firstChords: {
      intro: textOrNull(k.firstChords.intro),
      verse: textOrNull(k.firstChords.verse),
      chorus: textOrNull(k.firstChords.chorus),
      bridge: textOrNull(k.firstChords.bridge),
    },
  }));
}

/**
 * `setSongThemes` entries, in the same order as `value.themes`, so `entries.<i>` errors from the
 * server point back at the right tag (ThemesSection relies on this).
 */
export function toThemeEntries(
  themes: SongFormValue['themes'],
): Array<{ section: Section; themeId: UUID }> {
  return themes.map((t) => ({ section: t.section, themeId: t.theme.id }));
}

/** `setBranchUsage` entries (manual rows only), in form order. */
export function toUsageInput(usage: SongFormValue['usage']): UsageInput {
  return usage.map((u) => ({ branchId: u.branchId, level: u.level }));
}

/**
 * Copies the ids `setSongKeys` returned onto the form's keys (matched by key name, which is unique
 * per song), so new keys can take files straight away and the next save edits them in place.
 */
export function withSavedKeyIds(
  keys: SongFormValue['musical']['keys'],
  saved: readonly SongKey[],
): SongFormValue['musical']['keys'] {
  const byKey = new Map(saved.map((k) => [k.key, k.id]));
  return keys.map((k) => {
    const id = byKey.get(k.key);
    return id ? { ...k, id } : k;
  });
}

// ---------- Client-side validation ----------

export const FORM_MESSAGES = {
  title: 'Enter a title',
  composers: 'Add at least one composer',
  arrangement: (label: string) => `Add lyrics for ${label} or take it out of the arrangement`,
} as const;

const SECTION_NAME: Record<Section, string> = {
  chorus: 'the chorus',
  verse_1: 'verse 1',
  verse_2: 'verse 2',
  verse_3: 'verse 3',
  verse_4: 'verse 4',
  verse_5: 'verse 5',
  bridge: 'the bridge',
};

/**
 * What the server would reject outright, checked before any request: a title, at least one
 * composer, an arrangement that only uses sections with lyrics, and the musical rules
 * (`validateMusical`: 1–12 keys, one primary, valid chords, tempo…). Empty object means valid.
 */
export function validateSongForm(value: SongFormValue): SongFormErrors {
  const errors: SongFormErrors = { ...validateMusical(value.musical) };
  if (value.basic.title.trim() === '') errors.title = [FORM_MESSAGES.title];
  if (value.basic.composers.length === 0) errors.composerIds = [FORM_MESSAGES.composers];
  value.lyrics.arrangement.forEach((s, i) => {
    if (!value.lyrics.lyrics[s]?.trim()) {
      errors[`arrangement.${i}`] = [FORM_MESSAGES.arrangement(SECTION_NAME[s])];
    }
  });
  return errors;
}

// ---------- Error mapping ----------

type ActionError = Extract<ActionResult<unknown>, { ok: false }>['error'];

const add = (errors: SongFormErrors, key: string, messages: readonly string[]) => {
  if (messages.length) errors[key] = [...(errors[key] ?? []), ...messages];
};

/** Song errors already use form paths (`title`, `composerIds`, `lyrics.chorus`, `arrangement.2`). */
export function songErrorsToForm(error: ActionError): SongFormErrors {
  const out: SongFormErrors = {};
  for (const [key, messages] of Object.entries(error.fieldErrors ?? {})) {
    add(out, key === '(root)' ? 'form' : key, messages);
  }
  if (Object.keys(out).length === 0) add(out, 'form', [error.message]);
  return out;
}

/**
 * `setSongKeys` errors are indexed into the keys array (`1.key`, `0.firstChords.verse`) or sit at
 * the root ("Exactly one key must be primary"). A CONFLICT (deleting a key that still has files)
 * keys its fieldErrors by key name, so only its message is shown, on the keys list.
 */
export function keyErrorsToForm(error: ActionError): SongFormErrors {
  const out: SongFormErrors = {};
  if (error.code === 'VALIDATION') {
    for (const [key, messages] of Object.entries(error.fieldErrors ?? {})) {
      add(out, /^\d+(\.|$)/.test(key) ? `keys.${key}` : 'keys', messages);
    }
  }
  if (Object.keys(out).length === 0) add(out, 'keys', [error.message]);
  return out;
}

/** `setSongThemes` errors (`entries.<i>.themeId`) are passed through; ThemesSection maps them. */
export function themeErrorsToForm(error: ActionError): SongFormErrors {
  const out: SongFormErrors = {};
  for (const [key, messages] of Object.entries(error.fieldErrors ?? {})) {
    add(out, /^(entries|themes)(\.|$)/.test(key) ? key : 'themes', messages);
  }
  if (Object.keys(out).length === 0) add(out, 'themes', [error.message]);
  return out;
}

/** `setBranchUsage` errors (`<i>.branchId`, `<i>.level`) become `usage.<i>…`. */
export function usageErrorsToForm(error: ActionError): SongFormErrors {
  const out: SongFormErrors = {};
  for (const [key, messages] of Object.entries(error.fieldErrors ?? {})) {
    add(out, /^\d+(\.|$)/.test(key) ? `usage.${key}` : 'usage', messages);
  }
  if (Object.keys(out).length === 0) add(out, 'usage', [error.message]);
  return out;
}

export function mergeErrors(...all: SongFormErrors[]): SongFormErrors {
  const out: SongFormErrors = {};
  for (const errors of all) {
    for (const [key, messages] of Object.entries(errors)) add(out, key, messages);
  }
  return out;
}

// ---------- Tabs ----------

export const FORM_TABS = ['basic', 'musical', 'lyrics', 'themes', 'usage', 'files'] as const;
export type FormTab = (typeof FORM_TABS)[number];

const TAB_ROOTS: Record<string, FormTab> = {
  title: 'basic',
  altTitles: 'basic',
  composers: 'basic',
  composerIds: 'basic',
  sourceGroup: 'basic',
  year: 'basic',
  keys: 'musical',
  tempoBpm: 'musical',
  timeSignature: 'musical',
  energyLevel: 'musical',
  energyNotes: 'musical',
  lyrics: 'lyrics',
  arrangement: 'lyrics',
  themes: 'themes',
  entries: 'themes',
  usage: 'usage',
  resources: 'files',
};

/** The tab that shows an error key, or null for form-level errors. */
export function tabForErrorKey(key: string): FormTab | null {
  const root = key.replace(/\..*$/s, '');
  return Object.hasOwn(TAB_ROOTS, root) ? TAB_ROOTS[root]! : null;
}

/** Tabs with at least one error, in tab order. */
export function tabsWithErrors(errors: SongFormErrors): FormTab[] {
  const tabs = new Set(
    Object.entries(errors)
      .filter(([, m]) => m.length > 0)
      .map(([k]) => tabForErrorKey(k)),
  );
  return FORM_TABS.filter((t) => tabs.has(t));
}

// ---------- Save orchestration ----------

export interface SongSaveActions {
  createSong(input: SongInput): Promise<ActionResult<{ id: UUID }>>;
  updateSong(id: UUID, input: SongInput): Promise<ActionResult<void>>;
  setSongKeys(songId: UUID, keys: SongKeyInput[]): Promise<ActionResult<SongKey[]>>;
  setSongThemes(
    songId: UUID,
    entries: Array<{ section: Section; themeId: UUID }>,
  ): Promise<ActionResult<void>>;
  setBranchUsage(songId: UUID, entries: UsageInput): Promise<ActionResult<void>>;
}

export interface SaveOptions {
  /** null → create. */
  songId: UUID | null;
  /** The last saved value; slices equal to it are not re-sent. null → send everything. */
  saved: SongFormValue | null;
  /** Whether the user may write branch usage (`usage:write`). */
  canWriteUsage: boolean;
}

export type SaveResult =
  | { ok: true; songId: UUID; created: boolean; keys: SongKey[] | null }
  /** `songId` is set when the song row exists (it was created or already existed). */
  | {
      ok: false;
      songId: UUID | null;
      created: boolean;
      keys: SongKey[] | null;
      errors: SongFormErrors;
    };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Network or unexpected failures are reported as a form-level error rather than thrown. */
async function attempt<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch {
    return {
      ok: false,
      error: { code: 'INTERNAL', message: 'Couldn’t reach the server. Check your connection.' },
    };
  }
}

/**
 * Saves the form: the song row first (create or update), then keys, themes and usage. Keys,
 * themes and usage run only once the song row exists and, when editing, only for slices that
 * changed since `saved`. Every failure is collected and mapped onto form field paths.
 */
export async function saveSong(
  value: SongFormValue,
  actions: SongSaveActions,
  { songId, saved, canWriteUsage }: SaveOptions,
): Promise<SaveResult> {
  const created = songId === null;
  let id = songId;
  const changed = <T>(pick: (v: SongFormValue) => T) =>
    saved === null || !same(pick(value), pick(saved));

  if (id === null) {
    const res = await attempt(() => actions.createSong(toSongInput(value)));
    if (!res.ok) {
      return { ok: false, songId: null, created, keys: null, errors: songErrorsToForm(res.error) };
    }
    id = res.data.id;
  } else if (changed(toSongInput)) {
    const songId = id;
    const res = await attempt(() => actions.updateSong(songId, toSongInput(value)));
    if (!res.ok) {
      return { ok: false, songId, created, keys: null, errors: songErrorsToForm(res.error) };
    }
  }

  const songIdNow = id;
  const fresh = created;
  const [keysRes, themesRes, usageRes] = await Promise.all([
    changed((v) => toKeysInput(v.musical.keys))
      ? attempt(() => actions.setSongKeys(songIdNow, toKeysInput(value.musical.keys)))
      : null,
    // A new song has no themes or usage yet, so empty lists need no request.
    (fresh ? value.themes.length > 0 : changed((v) => toThemeEntries(v.themes)))
      ? attempt(() => actions.setSongThemes(songIdNow, toThemeEntries(value.themes)))
      : null,
    canWriteUsage && (fresh ? value.usage.length > 0 : changed((v) => toUsageInput(v.usage)))
      ? attempt(() => actions.setBranchUsage(songIdNow, toUsageInput(value.usage)))
      : null,
  ]);

  const errors = mergeErrors(
    keysRes && !keysRes.ok ? keyErrorsToForm(keysRes.error) : {},
    themesRes && !themesRes.ok ? themeErrorsToForm(themesRes.error) : {},
    usageRes && !usageRes.ok ? usageErrorsToForm(usageRes.error) : {},
  );
  const keys = keysRes?.ok ? keysRes.data : null;
  if (Object.keys(errors).length > 0) {
    return { ok: false, songId: songIdNow, created, keys, errors };
  }
  return { ok: true, songId: songIdNow, created, keys };
}
