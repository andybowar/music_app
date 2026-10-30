'use client';

import { GripVertical, Plus } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { SongRow } from '@/components/song/SongRow';
import { getItemsForList, getList, getSong, LIST_IDS, songSummaries } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import type { ResolvedItem, SongSummary } from '@/types/domain';

/** Eight fixture songs, like a Diagram III result list. */
const results: SongSummary[] = songSummaries.slice(0, 8);

const setlist = getList(LIST_IDS.bg41926);
const setlistItems: ResolvedItem[] = getItemsForList(setlist.id).map((item) =>
  resolveItemDisplay(getSong(item.songId), item),
);

const sparse: SongSummary = {
  ...songSummaries[0]!,
  id: 'sparse',
  title: 'A song with nothing filled in yet and a very long title that has to truncate',
  year: null,
  tempoBpm: null,
  timeSignature: null,
  energyLevel: null,
  primaryKey: null,
  composers: [],
  addedByBranchCode: null,
  resourceCount: 0,
};

const iconButton =
  'inline-flex min-h-tap min-w-tap items-center justify-center rounded-md outline-none hover:bg-row-foreground/10 focus-visible:ring-2 focus-visible:ring-row-foreground';

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {children}
    </section>
  );
}

/**
 * UI-05 gallery: SongRow with fixture songs. Every region logs its callback below. ADD and the
 * drag handle are placeholder slots here (the real ones come from LIST-06 / LIST-07).
 */
export function SongRowGallery() {
  const [log, setLog] = useState<string[]>([]);
  const record = (entry: string) => setLog((prev) => [entry, ...prev].slice(0, 8));

  const row = (song: SongSummary, resolved?: ResolvedItem, reorder = false) => (
    <SongRow
      song={song}
      resolved={resolved}
      onKey={() => record(`onKey() · ${song.title}`)}
      onTitle={() => record(`onTitle() · ${song.title}`)}
      onComposer={() => record(`onComposer() · ${song.title}`)}
      onResources={() => record(`onResources() · ${song.title}`)}
      onUsage={() => record(`onUsage() · ${song.title}`)}
      dragHandle={
        reorder ? (
          <button type="button" className={iconButton} aria-label={`Reorder ${song.title}`}>
            <GripVertical aria-hidden="true" className="size-4" />
          </button>
        ) : undefined
      }
      addSlot={
        <button
          type="button"
          className={`${iconButton} px-2 text-sm font-semibold`}
          aria-label={`Add ${song.title} to a list`}
          onClick={() => record(`ADD · ${song.title}`)}
        >
          <Plus aria-hidden="true" className="size-4 sm:hidden" />
          <span className="hidden sm:inline">ADD</span>
        </button>
      }
    />
  );

  return (
    <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Song row</h1>
        <p className="text-sm text-muted-foreground">
          UI-05 · BPM/energy, time signature, key, title, composer, year, Resources, branch, ADD.
          Below 480px the time signature hides and composer/year wrap under the title.
        </p>
      </header>

      <Section title="Search results (8 fixture songs)">
        <ul className="space-y-1">
          {results.map((s) => (
            <li key={s.id}>{row(s)}</li>
          ))}
        </ul>
      </Section>

      <Section
        title={`Setlist “${setlist.name}” (resolved, with drag handles)`}
        note="Values set for this event have a dotted underline; hover for the tooltip."
      >
        <ul className="space-y-1">
          {setlistItems.map((r) => (
            <li key={r.item.id}>{row(r.song, r, true)}</li>
          ))}
        </ul>
      </Section>

      <Section title="Nothing set">{row(sparse)}</Section>

      <Section title="360px wide">
        <div className="w-[360px] max-w-full space-y-1 rounded-md border p-2">
          {results.slice(0, 3).map((s) => (
            <div key={s.id}>{row(s)}</div>
          ))}
        </div>
      </Section>

      <Section title="Handler calls">
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">No calls yet. Tap any region of a row.</p>
        ) : (
          <ol className="space-y-1 font-mono text-sm" data-testid="handler-log">
            {log.map((entry, i) => (
              <li key={`${i}-${entry}`}>{entry}</li>
            ))}
          </ol>
        )}
      </Section>
    </main>
  );
}
