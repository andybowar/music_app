'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import {
  ResourcesSection,
  ResourcesSectionSkeleton,
} from '@/features/songs/ui/form/ResourcesSection';
import type { SongFormErrors, SongFormValue } from '@/features/songs/ui/form/types';
import { getSong, SONG_IDS, thousandHallelujahs } from '@/fixtures';
import type { Resource, SongDetail, SongKey } from '@/types/domain';
import { createFakeResourceApi, placeholderMediaUrl, type FailMode } from './fakeResourceApi';

type FormKey = SongFormValue['musical']['keys'][number];

const toFormKeys = (keys: SongKey[]): FormKey[] => keys.map(({ songId: _, ...k }) => k);
const musical = (keys: FormKey[]): Partial<SongFormValue> => ({
  musical: { keys, tempoBpm: null, timeSignature: null, energyLevel: null, energyNotes: null },
});

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

/** One section with its own fake backend, so each example is independent. */
function Example({
  song,
  keys = toFormKeys(song.keys),
  saved = true,
  errors,
  disabled,
  failMode,
}: {
  song: SongDetail;
  keys?: FormKey[];
  saved?: boolean;
  errors?: SongFormErrors;
  disabled?: boolean;
  failMode: () => FailMode;
}) {
  const api = useMemo(
    () => createFakeResourceApi({ seed: song.resources, failMode, mediaUrl: placeholderMediaUrl }),
    [song, failMode],
  );
  const [resources, setResources] = useState<Resource[]>(saved ? song.resources : []);
  return (
    <div className="space-y-3">
      <ResourcesSection
        value={musical(keys)}
        onChange={() => {}}
        errors={errors}
        disabled={disabled}
        songId={saved ? song.id : null}
        initialResources={saved ? song.resources : []}
        onResourcesChange={setResources}
        {...api}
      />
      <details className="text-xs">
        <summary className="cursor-pointer">Resources ({resources.length})</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-2">
          {JSON.stringify(
            resources.map(({ kind, format, label, songKeyId }) => ({
              kind,
              format,
              label,
              songKeyId,
            })),
            null,
            2,
          )}
        </pre>
      </details>
    </div>
  );
}

const FAIL_MODES: Array<{ mode: FailMode; label: string }> = [
  { mode: 'none', label: 'Uploads succeed' },
  { mode: 'request', label: 'Upload request is refused' },
  { mode: 'upload', label: 'Upload fails at 50%' },
  { mode: 'finalize', label: 'Finalize fails (retry only re-finalizes)' },
];

export function FormResourcesGallery() {
  const [mode, setMode] = useState<FailMode>('none');
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const failMode = useMemo(() => () => modeRef.current, []);

  const tenThousand = getSong(SONG_IDS.tenThousandReasons);
  const [eKey] = toFormKeys(tenThousand.keys) as [FormKey];
  const unsavedKey: FormKey = {
    key: 'F',
    isPrimary: false,
    firstChords: { intro: null, verse: null, chorus: null, bridge: null },
  };

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Song form: files &amp; links</h1>
        <p className="text-sm text-muted-foreground">
          LIB-14 gallery. Resource actions are in-memory fakes seeded from fixtures. Pick any small
          local file to upload: PDF, MP3/M4A, or .pro/.mdb/.ppt/.pptx for projection. Opening a file
          shows generated placeholder media. Link URLs containing “reject” fail server validation.
          Try https://youtu.be/fakeVid0001 for the YouTube preview.
        </p>
        <fieldset className="space-y-1 text-sm">
          <legend className="font-medium">Simulated upload result</legend>
          {FAIL_MODES.map((m) => (
            <label key={m.mode} className="flex min-h-tap items-center gap-2">
              <input
                type="radio"
                name="fail-mode"
                checked={mode === m.mode}
                onChange={() => setMode(m.mode)}
              />
              {m.label}
            </label>
          ))}
        </fieldset>
      </header>

      <Section title="Editing a song" note="A Thousand Hallelujahs: three keys plus projection.">
        <Example song={thousandHallelujahs} failMode={failMode} />
      </Section>

      <Section
        title="Unsaved key and removed key"
        note="10000 Reasons with key D removed and key F added but not saved yet."
      >
        <Example song={tenThousand} keys={[eKey, unsavedKey]} failMode={failMode} />
      </Section>

      <Section title="No files yet" note="Be Exalted, O God: empty state.">
        <Example song={getSong(SONG_IDS.beExaltedOGod)} failMode={failMode} />
      </Section>

      <Section title="New song" note="On /songs/new there is no song id yet.">
        <Example song={thousandHallelujahs} saved={false} failMode={failMode} />
      </Section>

      <Section title="Server errors" note="errors prop as returned in ActionResult fieldErrors.">
        <Example
          song={getSong(SONG_IDS.atTheCross)}
          errors={{ resources: ['Some files could not be saved'] }}
          failMode={failMode}
        />
      </Section>

      <Section title="Disabled" note="While the form is saving.">
        <Example song={getSong(SONG_IDS.reviveThisLand)} disabled failMode={failMode} />
      </Section>

      <Section title="Loading" note="ResourcesSectionSkeleton while the song is fetched.">
        <ResourcesSectionSkeleton />
      </Section>

      <Toaster />
    </main>
  );
}
