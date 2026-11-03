/**
 * Turns `AuditEntry` rows into readable text for the History tab (LIB-19). Pure; no I/O.
 * Diffs arrive already cleaned by `getAuditTrail` (see `trail.ts`).
 */

import {
  ENERGY_LEVELS,
  ENERGY_META,
  SECTIONS,
  SECTION_LABEL,
  type AuditEntry,
  type EnergyLevel,
  type Section,
} from '@/types/domain';

/** Longest value shown before it is cut with an ellipsis. */
export const MAX_VALUE_LENGTH = 120;

export type FieldChange =
  /** A value was set, changed or cleared. `from`/`to` are display text; `null` = not set. */
  | { kind: 'value'; field: string; label: string; from: string | null; to: string | null }
  /** Lyrics: which sections changed, without the text (it can be long). */
  | { kind: 'sections'; field: string; label: string; sections: string[] };

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  altTitles: 'Alternate titles',
  composers: 'Composers',
  sourceGroup: 'Source',
  year: 'Year',
  tempoBpm: 'Tempo (BPM)',
  timeSignature: 'Time signature',
  energyLevel: 'Energy',
  energyNotes: 'Energy notes',
  lyrics: 'Lyrics',
  arrangement: 'Arrangement',
  addedByBranch: 'Added by branch',
  key: 'Key',
  isPrimary: 'Primary key',
  introChord: 'Intro chord',
  verseChord: 'Verse chord',
  chorusChord: 'Chorus chord',
  bridgeChord: 'Bridge chord',
  kind: 'Type',
  format: 'Format',
  label: 'Label',
  url: 'Link',
  name: 'Name',
  popMember: 'People of Praise member',
  mergedInto: 'Merged into',
};

const isSection = (v: unknown): v is Section =>
  typeof v === 'string' && (SECTIONS as readonly string[]).includes(v);

const isEnergy = (v: unknown): v is EnergyLevel =>
  typeof v === 'string' && (ENERGY_LEVELS as readonly string[]).includes(v);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** "verseChord" → "Verse chord"; "video_link" → "Video link". */
export function humanize(text: string): string {
  const words = text
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Label for a diff field. Section keys (theme diffs) and branch codes (usage diffs) pass through. */
export function fieldLabel(entity: string, field: string): string {
  if (isSection(field)) return SECTION_LABEL[field];
  if (entity === 'branch_usage') return field;
  return FIELD_LABELS[field] ?? humanize(field);
}

function truncate(text: string): string {
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…` : text;
}

/** Display text for one side of a change; `null` when the value is empty. */
export function formatValue(field: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    if (field === 'energyLevel' && isEnergy(value)) return ENERGY_META[value].label;
    if (field === 'kind' || field === 'popMember') return humanize(value);
    return truncate(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    const items = value.map((v) =>
      isSection(v) ? SECTION_LABEL[v] : (formatValue(field, v) ?? ''),
    );
    return truncate(items.join(field === 'arrangement' ? ' · ' : ', '));
  }
  if (isRecord(value)) {
    // Branch usage: { level, source }.
    if (typeof value.level === 'string') {
      const level = humanize(value.level);
      return value.source === 'derived' ? `${level} (from setlists)` : level;
    }
    return truncate(JSON.stringify(value));
  }
  return truncate(String(value));
}

/** The field-level changes of an entry, in a stable, readable order. */
export function describeChanges(entry: Pick<AuditEntry, 'entity' | 'diff'>): FieldChange[] {
  const order = Object.keys(FIELD_LABELS);
  const rank = (f: string) => {
    if (isSection(f)) return SECTIONS.indexOf(f);
    const i = order.indexOf(f);
    return i === -1 ? order.length : i;
  };
  const fields = Object.keys(entry.diff).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

  const changes: FieldChange[] = [];
  for (const field of fields) {
    const change = entry.diff[field];
    if (!change) continue;
    const label = fieldLabel(entry.entity, field);
    if (field === 'lyrics' && (isRecord(change.from) || isRecord(change.to))) {
      const keys = new Set([
        ...Object.keys(isRecord(change.from) ? change.from : {}),
        ...Object.keys(isRecord(change.to) ? change.to : {}),
      ]);
      const sections = SECTIONS.filter((s) => keys.has(s)).map((s) => SECTION_LABEL[s]);
      if (sections.length > 0) changes.push({ kind: 'sections', field, label, sections });
      continue;
    }
    const from = formatValue(field, change.from);
    const to = formatValue(field, change.to);
    if (from === to) continue;
    changes.push({ kind: 'value', field, label, from, to });
  }
  return changes;
}

/** Text value of a field on whichever side has one (e.g. a key's name on create or delete). */
function sideText(entry: Pick<AuditEntry, 'diff'>, field: string): string | null {
  const change = entry.diff[field];
  if (!change) return null;
  const v = change.to ?? change.from;
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/** One-line summary of an entry, e.g. "Added key G" or "Edited song details". Sentence case. */
export function entryTitle(entry: Pick<AuditEntry, 'entity' | 'action' | 'diff'>): string {
  const { entity, action } = entry;
  switch (entity) {
    case 'song':
      return action === 'create'
        ? 'Created the song'
        : action === 'delete'
          ? 'Deleted the song'
          : 'Edited song details';
    case 'song_composers':
      return 'Changed composers';
    case 'song_themes':
      return 'Changed themes';
    case 'branch_usage':
      return 'Changed branch usage';
    case 'song_key': {
      const key = sideText(entry, 'key');
      if (action === 'create') return key ? `Added key ${key}` : 'Added a key';
      if (action === 'delete') return key ? `Removed key ${key}` : 'Removed a key';
      return 'Edited a key';
    }
    case 'resource': {
      const isLink = sideText(entry, 'format') === 'url';
      const noun = isLink ? 'link' : 'file';
      const label = sideText(entry, 'label');
      const named = label ? `${noun} “${truncate(label)}”` : `a ${noun}`;
      if (action === 'create') return `Added ${named}`;
      if (action === 'delete') return `Removed ${named}`;
      return label ? `Edited ${named}` : 'Edited a file or link';
    }
    default: {
      const verb = action === 'create' ? 'Created' : action === 'delete' ? 'Deleted' : 'Edited';
      return `${verb} ${humanize(entity).toLowerCase()}`;
    }
  }
}
