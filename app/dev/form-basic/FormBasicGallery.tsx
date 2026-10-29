'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Toaster } from '@/components/ui/sonner';
import {
  BasicInfoSection,
  BasicInfoSectionSkeleton,
} from '@/features/songs/ui/form/BasicInfoSection';
import {
  basicInfoFromSong,
  type SongFormErrors,
  type SongFormValue,
} from '@/features/songs/ui/form/types';
import { composers, getSong, SONG_IDS, thousandHallelujahs } from '@/fixtures';
import { createFakeComposerApi } from './fakeComposerApi';

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
  api,
}: {
  initial: Partial<SongFormValue>;
  errors?: SongFormErrors;
  disabled?: boolean;
  api: ReturnType<typeof createFakeComposerApi>;
}) {
  const [value, setValue] = useState<Partial<SongFormValue>>(initial);
  return (
    <div className="space-y-3">
      <BasicInfoSection
        value={value}
        onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
        errors={errors}
        disabled={disabled}
        searchComposers={api.searchComposers}
        createComposer={api.createComposer}
      />
      <details className="text-xs">
        <summary className="cursor-pointer">Form value</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-2">
          {JSON.stringify(value.basic, null, 2)}
        </pre>
      </details>
    </div>
  );
}

const popComposers = composers.filter((c) => c.popMember !== 'none');

export function FormBasicGallery() {
  const [failSearch, setFailSearch] = useState(false);
  const failRef = useRef(failSearch);
  failRef.current = failSearch;
  const api = useMemo(() => createFakeComposerApi({ shouldFailSearch: () => failRef.current }), []);

  const editing = basicInfoFromSong(thousandHallelujahs);
  const withPop = basicInfoFromSong(getSong(SONG_IDS.tenThousandReasons));

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Song form: basic info</h1>
        <p className="text-sm text-muted-foreground">
          LIB-10 gallery. Composer search and create use an in-memory fake seeded from fixtures
          (300ms latency). Try “Brooke”, “Martha”, or a new name to create one.
        </p>
        <label className="flex min-h-tap items-center gap-2 text-sm">
          <Checkbox checked={failSearch} onCheckedChange={(c) => setFailSearch(c === true)} />
          Make composer search fail (error state)
        </label>
      </header>

      <Section title="New song" note="Empty state: no alternate titles, no composers.">
        <Example initial={{}} api={api} />
      </Section>

      <Section title="Editing a song" note="Fixture: A Thousand Hallelujahs.">
        <Example initial={{ basic: editing }} api={api} />
      </Section>

      <Section
        title="POP composers, several to reorder"
        note="Current and past members are highlighted green, with a tooltip and text label."
      >
        <Example
          initial={{
            basic: {
              ...withPop,
              composers: [
                ...withPop.composers,
                ...popComposers.filter((c) => !withPop.composers.some((w) => w.id === c.id)),
              ],
            },
          }}
          api={api}
        />
      </Section>

      <Section title="Server errors" note="errors prop as returned in ActionResult fieldErrors.">
        <Example
          initial={{ basic: { ...editing, title: '', composers: [] } }}
          errors={{
            title: ['Title is required'],
            'altTitles.0': ['Too long'],
            composerIds: ['Add at least one composer'],
            year: ['Year must be between 1000 and 2100'],
          }}
          api={api}
        />
      </Section>

      <Section title="Disabled" note="While the form is saving.">
        <Example initial={{ basic: editing }} disabled api={api} />
      </Section>

      <Section title="Loading" note="BasicInfoSectionSkeleton while the song is fetched.">
        <BasicInfoSectionSkeleton />
      </Section>

      <Toaster />
    </main>
  );
}
