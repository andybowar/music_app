'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Toaster } from '@/components/ui/sonner';
import { ThemesSection, ThemesSectionSkeleton } from '@/features/songs/ui/form/ThemesSection';
import type { SongFormErrors, SongFormValue } from '@/features/songs/ui/form/types';
import { getSong, SONG_IDS, thousandHallelujahs } from '@/fixtures';
import type { SongDetail } from '@/types/domain';
import { createFakeThemeApi } from './fakeThemeApi';

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

/** The lyrics and themes slices of a fixture song. */
function fromSong(song: SongDetail): Partial<SongFormValue> {
  return {
    lyrics: { lyrics: { ...song.lyrics }, arrangement: [...song.arrangement] },
    themes: song.themes.map((e) => ({ section: e.section, theme: { ...e.theme } })),
  };
}

/** A section with its own state, so each gallery example is independent. */
function Example({
  initial,
  errors,
  disabled,
  api,
}: {
  initial: Partial<SongFormValue>;
  errors?: SongFormErrors;
  disabled?: boolean;
  api: ReturnType<typeof createFakeThemeApi>;
}) {
  const [value, setValue] = useState<Partial<SongFormValue>>(initial);
  return (
    <div className="space-y-3">
      <ThemesSection
        value={value}
        onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
        errors={errors}
        disabled={disabled}
        searchThemes={api.searchThemes}
        createTheme={api.createTheme}
      />
      <details className="text-xs">
        <summary className="cursor-pointer">Form value</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-2">
          {JSON.stringify(
            value.themes?.map((e) => `${e.section}: ${e.theme.name}`),
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}

export function FormThemesGallery() {
  const [failSearch, setFailSearch] = useState(false);
  const failRef = useRef(failSearch);
  failRef.current = failSearch;
  const api = useMemo(() => createFakeThemeApi({ shouldFailSearch: () => failRef.current }), []);

  const editing = fromSong(thousandHallelujahs);
  const agnusDei = fromSong(getSong(SONG_IDS.agnusDei));
  const orphaned: Partial<SongFormValue> = {
    ...agnusDei,
    lyrics: { lyrics: { ...agnusDei.lyrics?.lyrics, verse_1: null }, arrangement: ['chorus'] },
  };

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Song form: themes</h1>
        <p className="text-sm text-muted-foreground">
          LIB-13 gallery. Theme search and create use an in-memory fake seeded from fixtures and the
          draft vocabulary (300ms latency). Try “glo”, “holy”, or a new name such as “Still Small
          Voice” to see it normalized and created.
        </p>
        <label className="flex min-h-tap items-center gap-2 text-sm">
          <Checkbox checked={failSearch} onCheckedChange={(c) => setFailSearch(c === true)} />
          Make theme search fail (error state)
        </label>
      </header>

      <Section title="New song with lyrics" note="Sections with lyrics, no themes yet.">
        <Example initial={{ ...editing, themes: [] }} api={api} />
      </Section>

      <Section
        title="Editing a song"
        note="Fixture: A Thousand Hallelujahs. Add “praise” to Chorus too: same theme, two sections."
      >
        <Example initial={editing} api={api} />
      </Section>

      <Section title="No lyrics" note="Empty state: nothing to tag until lyrics are entered.">
        <Example initial={{}} api={api} />
      </Section>

      <Section
        title="Section lost its lyrics"
        note="Agnus Dei with Verse 1 cleared: its themes stay visible so they can be removed."
      >
        <Example initial={orphaned} api={api} />
      </Section>

      <Section title="Server errors" note="errors prop as returned in ActionResult fieldErrors.">
        <Example
          initial={agnusDei}
          errors={{
            themes: ['Couldn’t save themes'],
            'themes.0.themeId': ['Theme no longer exists'],
          }}
          api={api}
        />
      </Section>

      <Section title="Disabled" note="While the form is saving.">
        <Example initial={editing} disabled api={api} />
      </Section>

      <Section title="Loading" note="ThemesSectionSkeleton while the song is fetched.">
        <ThemesSectionSkeleton />
      </Section>

      <Toaster />
    </main>
  );
}
