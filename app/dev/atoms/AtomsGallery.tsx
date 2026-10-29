import type { ReactNode } from 'react';
import { BranchCode } from '@/components/song/BranchCode';
import { ComposerName } from '@/components/song/ComposerName';
import { EnergyChip } from '@/components/song/EnergyChip';
import { KeyBadge } from '@/components/song/KeyBadge';
import { TimeSigBadge } from '@/components/song/TimeSigBadge';
import { ROW_TOKEN } from '@/components/ui/tokens';
import { cn } from '@/components/ui/utils';
import { songs, toSummary } from '@/fixtures';
import { ENERGY_LEVELS, ENERGY_META, type SongSummary } from '@/types/domain';

const summaries: SongSummary[] = songs.map(toSummary);

/** First fixture song per energy level, so every level renders with real fixture data. */
const byEnergy = ENERGY_LEVELS.map((level) => ({
  level,
  song: summaries.find((s) => s.energyLevel === level) ?? null,
}));

const sparse = summaries.find((s) => s.energyLevel === null && s.tempoBpm === null) ?? null;
const popCurrent = summaries.find((s) => s.composers.some((c) => c.popMember === 'current'));
const popPast = summaries.find((s) => s.composers.some((c) => c.popMember === 'past'));
const manyComposers = summaries.reduce((a, b) => (b.composers.length > a.composers.length ? b : a));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Dark song-row surface the atoms are designed for. */
function Row({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        ROW_TOKEN.surface,
        'flex flex-wrap items-center gap-3 rounded-md px-3 py-2',
        className,
      )}
    >
      {children}
    </div>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <span className="text-xs text-row-foreground/70">{children}</span>;
}

/** A mock row in REQ-ROW-01 order, to see the atoms side by side (SongRow is UI-05). */
function SampleRow({ song }: { song: SongSummary }) {
  return (
    <Row className="flex-nowrap">
      <EnergyChip energy={song.energyLevel} bpm={song.tempoBpm} />
      <span className="hidden min-[480px]:inline-flex">
        <TimeSigBadge value={song.timeSignature} />
      </span>
      <KeyBadge value={song.primaryKey} />
      <span className="flex min-w-0 flex-1 flex-col min-[480px]:flex-row min-[480px]:gap-2">
        <span className={cn(ROW_TOKEN.title, 'truncate')}>{song.title}</span>
        <span className="truncate text-sm">
          <ComposerName composers={song.composers} /> {song.year ?? ''}
        </span>
      </span>
      <BranchCode code={song.addedByBranchCode} />
    </Row>
  );
}

export function AtomsGallery() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Song atoms</h1>
        <p className="text-sm text-muted-foreground">
          UI-04 · EnergyChip, KeyBadge, TimeSigBadge, ComposerName, BranchCode. Hover any atom for
          its tooltip; every atom also has an accessible name.
        </p>
      </header>

      <Section title="EnergyChip · every level">
        <Row>
          {byEnergy.map(({ level, song }) => (
            <span key={level} className="flex flex-col items-center gap-1">
              <EnergyChip energy={level} bpm={song?.tempoBpm ?? null} />
              <Caption>{ENERGY_META[level].label}</Caption>
            </span>
          ))}
        </Row>
      </Section>

      <Section title="EnergyChip · null and overridden">
        <Row>
          <span className="flex flex-col items-center gap-1">
            <EnergyChip energy={null} bpm={null} />
            <Caption>both null</Caption>
          </span>
          <span className="flex flex-col items-center gap-1">
            <EnergyChip energy={null} bpm={72} />
            <Caption>energy null</Caption>
          </span>
          <span className="flex flex-col items-center gap-1">
            <EnergyChip energy="high_praise" bpm={null} />
            <Caption>bpm null</Caption>
          </span>
          <span className="flex flex-col items-center gap-1">
            <EnergyChip energy="high_worship" bpm={80} overridden />
            <Caption>overridden</Caption>
          </span>
        </Row>
      </Section>

      <Section title="KeyBadge">
        <Row>
          <span className="flex flex-col items-center gap-1">
            <KeyBadge value="D" />
            <Caption>D</Caption>
          </span>
          <span className="flex flex-col items-center gap-1">
            <KeyBadge value="Bb" />
            <Caption>Bb</Caption>
          </span>
          <span className="flex flex-col items-center gap-1">
            <KeyBadge value="F#m" />
            <Caption>F#m</Caption>
          </span>
          <span className="flex flex-col items-center gap-1">
            <KeyBadge value="E" overridden />
            <Caption>overridden</Caption>
          </span>
          <span className="flex flex-col items-center gap-1">
            <KeyBadge value={null} />
            <Caption>null</Caption>
          </span>
        </Row>
      </Section>

      <Section title="TimeSigBadge">
        <Row>
          {(['4/4', '3/4', '6/8', '12/8', null] as const).map((v) => (
            <span key={v ?? 'null'} className="flex flex-col items-center gap-1">
              <TimeSigBadge value={v} />
              <Caption>{v ?? 'null'}</Caption>
            </span>
          ))}
        </Row>
      </Section>

      <Section title="ComposerName">
        <Row className="flex-col items-start">
          {popCurrent && (
            <span>
              <ComposerName composers={popCurrent.composers} /> <Caption>POP current</Caption>
            </span>
          )}
          {popPast && (
            <span>
              <ComposerName composers={popPast.composers} /> <Caption>POP past</Caption>
            </span>
          )}
          <span>
            <ComposerName composers={manyComposers.composers} />{' '}
            <Caption>default max (2), overflow</Caption>
          </span>
          <span>
            <ComposerName
              composers={[
                { name: 'Peter Lindqvist', popMember: 'current' },
                { name: 'Martha Kowal', popMember: 'past' },
                { name: 'Matt Redman', popMember: 'none' },
              ]}
              max={3}
            />{' '}
            <Caption>mixed, max 3</Caption>
          </span>
          <span>
            <ComposerName composers={[]} /> <Caption>empty</Caption>
          </span>
        </Row>
      </Section>

      <Section title="BranchCode">
        <Row>
          {['OR', 'SV', 'CO', null].map((code) => (
            <span key={code ?? 'null'} className="flex flex-col items-center gap-1">
              <BranchCode code={code} />
              <Caption>{code ?? 'null'}</Caption>
            </span>
          ))}
        </Row>
      </Section>

      <Section title="Composed (fixture songs)">
        <div className="space-y-1">
          {[
            ...byEnergy.flatMap(({ song }) => (song ? [song] : [])),
            ...(sparse ? [sparse] : []),
          ].map((song) => (
            <SampleRow key={song.id} song={song} />
          ))}
        </div>
      </Section>
    </main>
  );
}
