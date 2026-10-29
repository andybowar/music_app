'use client';

import { useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import {
  lyricsFromSong,
  LyricsSection,
  LyricsSectionSkeleton,
} from '@/features/songs/ui/form/LyricsSection';
import type { SongFormErrors, SongFormValue } from '@/features/songs/ui/form/types';
import { getSong, SONG_IDS, thousandHallelujahs } from '@/fixtures';

function Section({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <header>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{note}</p>
      </header>
      {children}
    </section>
  );
}

/** A section with its own state, so each gallery example is independent. */
function Example({
  initial,
  errors,
  disabled,
}: {
  initial: Partial<SongFormValue>;
  errors?: SongFormErrors;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<Partial<SongFormValue>>(initial);
  return (
    <div className="space-y-3">
      <LyricsSection
        value={value}
        onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
        errors={errors}
        disabled={disabled}
      />
      <details className="text-xs">
        <summary className="cursor-pointer">Form value</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-2">
          {JSON.stringify(value.lyrics, null, 2)}
        </pre>
      </details>
    </div>
  );
}

const editing = lyricsFromSong(thousandHallelujahs);
const fiveVerses = lyricsFromSong(getSong(SONG_IDS.amazingGrace));

export function FormLyricsGallery() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Song form: lyrics</h1>
        <p className="text-sm text-muted-foreground">
          LIB-12 gallery. Lyrics come from fixtures (first lines plus placeholders). Try “Paste full
          lyrics” with headings like “Verse 1”, “Chorus x2” or “Tag”, or clear a section that is in
          the order.
        </p>
      </header>

      <Section title="New song" note="Empty state: verses 3–5 collapsed, no order yet.">
        <Example initial={{}} />
      </Section>

      <Section title="Editing a song" note="Fixture: A Thousand Hallelujahs (chorus repeats).">
        <Example initial={{ lyrics: editing }} />
      </Section>

      <Section title="All five verses" note="Fixture: Amazing Grace. Verses 3–5 show because used.">
        <Example initial={{ lyrics: fiveVerses }} />
      </Section>

      <Section
        title="Errors"
        note="Over-long section (local check) plus the errors prop as returned in ActionResult fieldErrors."
      >
        <Example
          initial={{
            lyrics: {
              lyrics: { ...editing.lyrics, bridge: 'Placeholder '.repeat(420) },
              arrangement: [...editing.arrangement, 'verse_3'],
            },
          }}
          errors={{
            'lyrics.chorus': ['Chorus could not be saved'],
            'arrangement.6': ['Arrangement uses verse_3, which has no lyrics'],
          }}
        />
      </Section>

      <Section title="Disabled" note="While the form is saving.">
        <Example initial={{ lyrics: editing }} disabled />
      </Section>

      <Section title="Loading" note="LyricsSectionSkeleton while the song is fetched.">
        <LyricsSectionSkeleton />
      </Section>

      <Toaster />
    </main>
  );
}
