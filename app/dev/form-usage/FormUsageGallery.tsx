'use client';

import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Toaster } from '@/components/ui/sonner';
import {
  UsageSection,
  UsageSectionSkeleton,
  usageFromSong,
} from '@/features/songs/ui/form/UsageSection';
import type { SongFormErrors, SongFormValue } from '@/features/songs/ui/form/types';
import { branches, getSong, SONG_IDS, users } from '@/fixtures';
import type { AppUser, BranchUsage, SongDetail } from '@/types/domain';
import { createFakeUsageApi } from './fakeUsageApi';

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

/** A section with its own state and a fake save, so each gallery example is independent. */
function Example({
  song,
  user,
  errors: initialErrors,
  disabled,
  shouldFail,
}: {
  song?: SongDetail;
  user: AppUser | null;
  errors?: SongFormErrors;
  disabled?: boolean;
  shouldFail: () => boolean;
}) {
  const api = useMemo(
    () => createFakeUsageApi(song?.usage ?? [], { shouldFail }),
    [song, shouldFail],
  );
  const [value, setValue] = useState<Partial<SongFormValue>>(
    song ? { usage: usageFromSong(song) } : {},
  );
  const [saved, setSaved] = useState<BranchUsage[]>(song?.usage ?? []);
  const [errors, setErrors] = useState<SongFormErrors | undefined>(initialErrors);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const result = await api.setBranchUsage(song?.id ?? 'new', value.usage ?? []);
    setSaving(false);
    if (result.ok) {
      setErrors(undefined);
      setSaved(api.stored);
      toast.success('Branch usage saved');
    } else {
      setErrors(result.error.fieldErrors);
      toast.error(`Couldn't save: ${result.error.message}`);
    }
  };

  return (
    <div className="space-y-3">
      <UsageSection
        value={value}
        onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
        errors={errors}
        branches={branches}
        user={user}
        saved={saved}
        disabled={disabled || saving}
      />
      <Button type="button" variant="outline" disabled={disabled || saving} onClick={save}>
        {saving ? 'Saving…' : 'Save (fake setBranchUsage)'}
      </Button>
      <details className="text-xs">
        <summary className="cursor-pointer">Form value and stored usage</summary>
        <pre className="mt-2 overflow-x-auto rounded bg-muted p-2">
          {JSON.stringify({ usage: value.usage ?? [], stored: saved }, null, 2)}
        </pre>
      </details>
    </div>
  );
}

const byRole = (role: AppUser['role']) =>
  users.find((u) => u.role === role && u.disabledAt === null) ?? null;
const contributor = byRole('contributor');
const member = byRole('member');
const disabledUser = users.find((u) => u.disabledAt !== null) ?? null;

export function FormUsageGallery() {
  const selectId = useId();
  const [userId, setUserId] = useState(contributor?.id ?? '');
  const [fail, setFail] = useState(false);
  const failRef = useRef(fail);
  failRef.current = fail;
  const shouldFail = useMemo(() => () => failRef.current, []);
  const user = users.find((u) => u.id === userId) ?? null;

  const mixed = getSong(SONG_IDS.tenThousandReasons); // CO derived
  const allManual = getSong(SONG_IDS.thousandHallelujahs);

  return (
    <main className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <header className="space-y-3">
        <h1 className="text-2xl font-semibold">Song form: branch usage</h1>
        <p className="text-sm text-muted-foreground">
          LIB-15 gallery with the four fixture branches. Saving uses an in-memory fake of
          setBranchUsage (300ms latency).
        </p>
        <div className="space-y-1">
          <label htmlFor={selectId} className="text-sm font-medium">
            Viewing as (the first three examples)
          </label>
          <select
            id={selectId}
            className="block h-tap w-full rounded-md border bg-background px-2 text-sm"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.role}
                {u.disabledAt ? ', disabled' : ''})
              </option>
            ))}
            <option value="">Signed out</option>
          </select>
        </div>
        <label className="flex min-h-tap items-center gap-2 text-sm">
          <Checkbox checked={fail} onCheckedChange={(c) => setFail(c === true)} />
          Make save fail (server field errors)
        </label>
      </header>

      <Section title="New song" note="Nothing set yet: every branch shows None, not set.">
        <Example key={`new-${userId}`} user={user} shouldFail={shouldFail} />
      </Section>

      <Section
        title="Manual and derived values"
        note="Fixture: 10000 Reasons. CO Springs is derived (badge, muted selection); choosing a level overrides it and Clear brings it back."
      >
        <Example key={`mixed-${userId}`} song={mixed} user={user} shouldFail={shouldFail} />
      </Section>

      <Section title="All manual" note="Fixture: A Thousand Hallelujahs.">
        <Example key={`manual-${userId}`} song={allManual} user={user} shouldFail={shouldFail} />
      </Section>

      <Section title="Read-only: member" note="Members can see usage but not change it.">
        <Example song={mixed} user={member} shouldFail={shouldFail} />
      </Section>

      <Section title="Read-only: disabled account" note="Disabled users can do nothing.">
        <Example song={allManual} user={disabledUser} shouldFail={shouldFail} />
      </Section>

      <Section title="Server errors" note="errors prop as returned in ActionResult fieldErrors.">
        <Example
          song={mixed}
          user={contributor}
          shouldFail={shouldFail}
          errors={{
            usage: ['Could not save branch usage'],
            'usage.1.level': ['Invalid option: expected one of "high"|"low"|"rare"|"none"'],
          }}
        />
      </Section>

      <Section title="Disabled" note="While the form is saving.">
        <Example song={mixed} user={contributor} disabled shouldFail={shouldFail} />
      </Section>

      <Section title="No branches" note="Empty state before an admin adds branches.">
        <UsageSection value={{}} onChange={() => {}} branches={[]} user={contributor} />
      </Section>

      <Section title="Loading" note="UsageSectionSkeleton while the song is fetched.">
        <UsageSectionSkeleton />
      </Section>

      <Toaster />
    </main>
  );
}
