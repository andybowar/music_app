'use client';

import { useState, type ReactNode } from 'react';
import { ChordLyrics } from '@/components/song/ChordLyrics';
import { LyricsViewer } from '@/components/song/LyricsViewer';
import { Toaster } from '@/components/ui/sonner';
import { lyricsFromSong, LyricsSection } from '@/features/songs/ui/form/LyricsSection';
import { musicalInfoFromSong } from '@/features/songs/ui/form/MusicalSection';
import type { SongFormValue } from '@/features/songs/ui/form/types';
import { getSong, SONG_IDS } from '@/fixtures';
import { songChordSets } from '@/lib/lyrics/chords';
import { transposeChordText } from '@/lib/lyrics/transpose';
import { SECTIONS, type SongDetail, type SongLyrics } from '@/types/domain';

const fixture = getSong(SONG_IDS.amazingGrace);
const gKey = fixture.keys.find((k) => k.chords)!;

/** Amazing Grace with a second key, A, whose chords are G's transposed: a two-key example. */
const amazingGrace: SongDetail = {
  ...fixture,
  keys: [
    ...fixture.keys,
    {
      ...gKey,
      id: '50000000-0000-4000-8000-00000000a0a0',
      key: 'A',
      isPrimary: false,
      chords: Object.fromEntries(
        SECTIONS.map((s) => [
          s,
          gKey.chords![s] ? transposeChordText(gKey.chords![s]!, 'G', 'A') : null,
        ]),
      ) as SongLyrics,
    },
  ],
};

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
          {JSON.stringify({ lyrics: value.lyrics, keys: value.musical?.keys }, null, 2)}
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
        note="Fixture: Amazing Grace in G and A (A transposed from G). Switch key, or hide chords."
      >
        <LyricsViewer
          lyrics={amazingGrace.lyrics}
          arrangement={amazingGrace.arrangement}
          chords={songChordSets(amazingGrace.keys)}
        />
      </Frame>

      <Frame
        title="Form: editing a song with chords in two keys"
        note="Edit the words in G and watch A follow. D has no chords yet: start it from the lyrics, or Fill from G."
      >
        <FormExample
          initial={{
            lyrics: lyricsFromSong(amazingGrace),
            musical: {
              ...musicalInfoFromSong(amazingGrace),
              keys: [
                ...musicalInfoFromSong(amazingGrace).keys,
                {
                  key: 'D',
                  isPrimary: false,
                  firstChords: { intro: 'D', verse: 'D', chorus: 'G', bridge: null },
                },
              ],
            },
          }}
        />
      </Frame>

      <Frame
        title="Form: new song, chords off"
        note="Tick the box to add chords, or paste this chord sheet into “Paste full lyrics”."
      >
        <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">{SHEET}</pre>
        <FormExample
          initial={{
            musical: {
              keys: [
                {
                  key: 'C',
                  isPrimary: true,
                  firstChords: { intro: null, verse: null, chorus: null, bridge: null },
                },
              ],
              tempoBpm: null,
              timeSignature: null,
              energyLevel: null,
              energyNotes: null,
            },
          }}
        />
      </Frame>

      <Toaster />
    </main>
  );
}
