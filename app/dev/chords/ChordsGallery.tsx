'use client';

import { useState, type ReactNode } from 'react';
import { ChordLyrics } from '@/components/song/ChordLyrics';
import { LyricsViewer } from '@/components/song/LyricsViewer';
import { Toaster } from '@/components/ui/sonner';
import { lyricsFromSong, LyricsSection } from '@/features/songs/ui/form/LyricsSection';
import { musicalInfoFromSong } from '@/features/songs/ui/form/MusicalSection';
import type { SongFormValue } from '@/features/songs/ui/form/types';
import { getSong, SONG_IDS } from '@/fixtures';

const amazingGrace = getSong(SONG_IDS.amazingGrace);

/** Made-up words, to show layout only. */
const SAMPLE = [
  '[G] [D/F#] [Em] [C]',
  '[G]Made-up words to [C]show the [G]chords',
  'Mid-word chords stay to[D]gether: won[Em]der[C]ful',
  'A line with no chords at all',
  '',
  'A [Am7]long line that wraps on a [Cmaj7]narrow phone screen and keeps each [Dsus4]chord over its [G]word',
].join('\n');

const SHEET = [
  'Verse 1',
  'G              C          G',
  'Made-up words for a test song',
  '',
  'Chorus',
  'C        G         D',
  'Sing a placeholder chorus',
].join('\n');

function Frame({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <header>
        <h2 className="text-lg font-semibold">{title}</h2>
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </header>
      {children}
    </section>
  );
}

function FormExample({ initial }: { initial: Partial<SongFormValue> }) {
  const [value, setValue] = useState<Partial<SongFormValue>>(initial);
  return (
    <div className="space-y-3">
      <LyricsSection value={value} onChange={(patch) => setValue((v) => ({ ...v, ...patch }))} />
      <details className="text-xs">
        <summary className="cursor-pointer">Form value</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-2">
          {JSON.stringify(value.lyrics, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function ChordsGallery() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Chords over lyrics</h1>
        <p className="text-sm text-muted-foreground">
          LIB-22 gallery. Chords are optional and written inline in square brackets. Words are
          fixtures and made-up placeholders.
        </p>
      </header>

      <Frame
        title="ChordLyrics"
        note="Chord-only line, mid-word chords, a plain line and wrapping."
      >
        <ChordLyrics text={SAMPLE} className="text-lg leading-snug" />
      </Frame>

      <Frame
        title="LyricsViewer with chords"
        note="Fixture: Amazing Grace. Toggle chords off and on."
      >
        <LyricsViewer
          lyrics={amazingGrace.lyrics}
          arrangement={amazingGrace.arrangement}
          chords={amazingGrace.chords}
        />
      </Frame>

      <Frame title="Form: editing a song with chords" note="Unticking the box asks first.">
        <FormExample
          initial={{
            lyrics: lyricsFromSong(amazingGrace),
            musical: musicalInfoFromSong(amazingGrace),
          }}
        />
      </Frame>

      <Frame
        title="Form: new song, chords off"
        note="Tick the box to add chords, or paste this chord sheet into “Paste full lyrics”."
      >
        <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{SHEET}</pre>
        <FormExample initial={{}} />
      </Frame>

      <Toaster />
    </main>
  );
}
