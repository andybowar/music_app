'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  emptyMusicalInfo,
  MusicalSection,
  MusicalSectionSkeleton,
  musicalInfoFromSong,
  validateMusical,
} from '@/features/songs/ui/form/MusicalSection';
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

/**
 * A section with its own state, so each gallery example is independent. "Check like submit" runs
 * `validateMusical` the way the form page will before saving, and shows the result as errors.
 */
function Example({
  initial,
  errors: serverErrors,
  disabled,
}: {
  initial: Partial<SongFormValue>;
  errors?: SongFormErrors;
  disabled?: boolean;
}) {
  const [value, setValue] = useState<Partial<SongFormValue>>(initial);
  const [checked, setChecked] = useState<SongFormErrors | null>(null);
  return (
    <div className="space-y-3">
      <MusicalSection
        value={value}
        onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
        errors={checked ?? serverErrors}
        disabled={disabled}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-tap"
          disabled={disabled}
          onClick={() => setChecked(validateMusical(value.musical ?? emptyMusicalInfo()))}
        >
          Check like submit
        </Button>
        {checked && (
          <p className="text-sm" role="status">
            {Object.keys(checked).length === 0 ? 'Valid, ready to save.' : 'Fix the errors above.'}
          </p>
        )}
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer">Form value</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-2">
          {JSON.stringify(value.musical, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function FormMusicalGallery() {
  const editing = musicalInfoFromSong(thousandHallelujahs);
  const quiet = musicalInfoFromSong(getSong(SONG_IDS.beTheCenter));

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Song form: musical tags</h1>
        <p className="text-sm text-muted-foreground">
          LIB-11 gallery. Keys with first chords, tempo, time signature, energy level and notes. Use
          “Check like submit” to run the client validation the form runs before saving.
        </p>
      </header>

      <Section title="New song" note="Empty state: no keys yet, nothing set.">
        <Example initial={{}} />
      </Section>

      <Section title="Editing a song" note="Fixture: A Thousand Hallelujahs (three keys).">
        <Example initial={{ musical: editing }} />
      </Section>

      <Section title="Another song" note="Fixture: Be the Center, quiet worship.">
        <Example initial={{ musical: quiet }} />
      </Section>

      <Section
        title="No primary key"
        note="Loaded data with zero primaries shows an inline error until one is chosen."
      >
        <Example
          initial={{
            musical: { ...editing, keys: editing.keys.map((k) => ({ ...k, isPrimary: false })) },
          }}
        />
      </Section>

      <Section title="Two primary keys" note="Picking one primary clears the error.">
        <Example
          initial={{
            musical: { ...editing, keys: editing.keys.map((k, i) => ({ ...k, isPrimary: i < 2 })) },
          }}
        />
      </Section>

      <Section title="Server errors" note="errors prop as returned in ActionResult fieldErrors.">
        <Example
          initial={{ musical: { ...editing, tempoBpm: 400, timeSignature: '4' } }}
          errors={{
            keys: ['Exactly one key must be primary'],
            'keys.1.key': ['Duplicate key Db'],
            'keys.2.firstChords.chorus': ['Invalid chord'],
            tempoBpm: ['Tempo must be between 20 and 300'],
            timeSignature: ['Invalid time signature'],
            energyNotes: ['Too long'],
          }}
        />
      </Section>

      <Section title="Disabled" note="While the form is saving.">
        <Example initial={{ musical: editing }} disabled />
      </Section>

      <Section title="Loading" note="MusicalSectionSkeleton while the song is fetched.">
        <MusicalSectionSkeleton />
      </Section>
    </main>
  );
}
