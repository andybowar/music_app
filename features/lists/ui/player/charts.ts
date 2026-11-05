/**
 * What the set player can show for one setlist song (LIST-11). Pure, exported for tests.
 */
import { songChordSets } from '@/lib/lyrics/chords';
import { openPlan } from '@/features/songs/ui/SongPage';
import { SECTIONS } from '@/types/domain';
import type {
  MusicalKey,
  ResolvedItem,
  Resource,
  ResourceKind,
  SongChords,
  SongDetail,
} from '@/types/domain';

/** PDF kinds a musician can open, in the order they're offered. */
export const CHART_KINDS = [
  'chord_chart',
  'lead_sheet',
  'full_score',
] as const satisfies readonly ResourceKind[];

export const CHART_KIND_LABEL: Record<(typeof CHART_KINDS)[number], string> = {
  chord_chart: 'Chord chart',
  lead_sheet: 'Lead sheet',
  full_score: 'Full score',
};

export type ChartOption =
  | { type: 'typed'; id: string; label: string; chords: SongChords }
  | { type: 'pdf'; id: string; label: string; resource: Resource };

/** Whether any of the song's keys has typed chords over its lyrics (LIB-22/23). */
export function hasTypedChords(detail: SongDetail | undefined): boolean {
  return !!detail && songChordSets(detail.keys).length > 0;
}

/**
 * The charts a musician can choose from: typed chords first, then the effective key's PDF
 * chord charts, lead sheets and scores (in that order, oldest upload first within a kind).
 */
export function chartOptions(
  resolved: ResolvedItem,
  detail: SongDetail | undefined,
): ChartOption[] {
  const options: ChartOption[] = [];
  // One option per key with typed chords, the setlist's key first.
  for (const chords of detail ? songChordSets(detail.keys, resolved.key) : []) {
    options.push({ type: 'typed', id: `typed:${chords.key}`, label: 'Typed chords', chords });
  }
  for (const kind of CHART_KINDS) {
    for (const r of resolved.resources) {
      if (r.kind !== kind || openPlan(r).type !== 'pdf') continue;
      const kindLabel = CHART_KIND_LABEL[kind];
      const label =
        r.label.trim() && r.label.trim() !== kindLabel ? `${kindLabel}: ${r.label}` : kindLabel;
      options.push({ type: 'pdf', id: r.id, label, resource: r });
    }
  }
  // Two files with the same label ("Chord chart" twice) get numbered so they can be told apart.
  const counts = new Map<string, number>();
  // Typed chords are told apart by their key, so they're left out of the numbering.
  for (const o of options)
    if (o.type === 'pdf') counts.set(o.label, (counts.get(o.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  return options.map((o) => {
    if ((counts.get(o.label) ?? 0) < 2) return o;
    const n = (seen.get(o.label) ?? 0) + 1;
    seen.set(o.label, n);
    return { ...o, label: `${o.label} ${n}` };
  });
}

/**
 * A warning when the typed chords are written in another key than the setlist plays in
 * (transposing isn't built yet, TODO #2). Null when they agree or either key is unknown.
 */
export function keyMismatch(
  chordsKey: MusicalKey | null,
  setlistKey: MusicalKey | null,
): string | null {
  if (!chordsKey || !setlistKey || chordsKey === setlistKey) return null;
  return `These chords are written in ${chordsKey}; this setlist plays the song in ${setlistKey}.`;
}

export function hasLyrics(detail: SongDetail | undefined): boolean {
  return !!detail && SECTIONS.some((s) => !!detail.lyrics[s]?.trim());
}
