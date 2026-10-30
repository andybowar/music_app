'use client';

import type { ReactNode } from 'react';
import { ResponsivePanel } from '@/components/ResponsivePanel';
import { BranchCode } from '@/components/song/BranchCode';
import { ComposerName } from '@/components/song/ComposerName';
import { EnergyChip } from '@/components/song/EnergyChip';
import { KeyBadge } from '@/components/song/KeyBadge';
import { ComposerPanel, ComposerPanelSkeleton } from '@/components/song/panels/ComposerPanel';
import { KeyPanel, KeyPanelSkeleton } from '@/components/song/panels/KeyPanel';
import { ReminderPanel, ReminderPanelSkeleton } from '@/components/song/panels/ReminderPanel';
import { UsagePanel, UsagePanelSkeleton } from '@/components/song/panels/UsagePanel';
import { TimeSigBadge } from '@/components/song/TimeSigBadge';
import { ROW_TOKEN } from '@/components/ui/tokens';
import { cn } from '@/components/ui/utils';
import { songs, thousandHallelujahs as song } from '@/fixtures';
import type { BranchUsage } from '@/types/domain';

const primaryKey = song.keys.find((k) => k.isPrimary)?.key ?? null;
const popSong = songs.find((s) => s.composers.some((c) => c.popMember !== 'none'));
const derivedUsage: BranchUsage[] = song.usage.map((u, i) =>
  i % 2 === 0 ? { ...u, source: 'derived' } : { ...u, level: i === 3 ? 'none' : u.level },
);

const rowButton =
  'inline-flex min-h-tap min-w-tap items-center justify-center rounded-md px-1 outline-none hover:bg-white/10 focus-visible:ring-[3px] focus-visible:ring-ring/50';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** A panel's content on a popover-like surface, so it can be seen without opening anything. */
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <figure className="w-full max-w-80 rounded-md border bg-popover p-4 text-popover-foreground shadow-md">
      <figcaption className="mb-2 text-sm font-semibold">{title}</figcaption>
      {children}
    </figure>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-4 sm:grid-cols-2">{children}</div>;
}

/** Mock row in REQ-ROW-01 order whose regions open the panels (SongRow itself is UI-05). */
function TapRow() {
  return (
    <div className={cn(ROW_TOKEN.surface, 'flex items-center gap-1 rounded-md px-2 py-1')}>
      <EnergyChip energy={song.energyLevel} bpm={song.tempoBpm} />
      <span className="hidden min-[480px]:inline-flex">
        <TimeSigBadge value={song.timeSignature} />
      </span>
      <ResponsivePanel
        title="Keys"
        trigger={
          <button type="button" className={rowButton} aria-label="Keys and first chords">
            <KeyBadge value={primaryKey} />
          </button>
        }
      >
        <KeyPanel keys={song.keys} />
      </ResponsivePanel>
      <span className="flex min-w-0 flex-1 flex-col min-[480px]:flex-row min-[480px]:items-center">
        <ResponsivePanel
          title={song.title}
          trigger={
            <button
              type="button"
              className={cn(rowButton, ROW_TOKEN.title, 'justify-start truncate')}
            >
              {song.title}
            </button>
          }
        >
          <ReminderPanel chorusLine={song.chorusLine} verse1Line={song.verse1Line} />
        </ResponsivePanel>
        <ResponsivePanel
          title="Composers"
          trigger={
            <button type="button" className={cn(rowButton, 'justify-start gap-1 truncate text-sm')}>
              <ComposerName composers={song.composers} /> {song.year ?? ''}
            </button>
          }
        >
          <ComposerPanel composers={song.composers} />
        </ResponsivePanel>
      </span>
      <ResponsivePanel
        title="Branch usage"
        trigger={
          <button type="button" className={rowButton} aria-label="Branch usage">
            <BranchCode code={song.addedByBranchCode} />
          </button>
        }
      >
        <UsagePanel addedByBranchCode={song.addedByBranchCode} usage={song.usage} />
      </ResponsivePanel>
    </div>
  );
}

export function PanelsGallery() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Detail panels</h1>
        <p className="text-sm text-muted-foreground">
          UI-06 · KeyPanel, ComposerPanel, UsagePanel, ReminderPanel for “{song.title}”. Tap a
          region of the row to open its panel (popover at 768px and up, bottom sheet below).
        </p>
      </header>

      <Section title="Open from a row">
        <TapRow />
      </Section>

      <Section title={`“${song.title}” (Diagram III)`}>
        <Grid>
          <Card title="Keys">
            <KeyPanel keys={song.keys} />
          </Card>
          <Card title={song.title}>
            <ReminderPanel chorusLine={song.chorusLine} verse1Line={song.verse1Line} />
          </Card>
          <Card title="Composers">
            <ComposerPanel composers={song.composers} />
          </Card>
          <Card title="Branch usage">
            <UsagePanel addedByBranchCode={song.addedByBranchCode} usage={song.usage} />
          </Card>
        </Grid>
      </Section>

      <Section title="Variants">
        <Grid>
          <Card title="Keys · highlight E">
            <KeyPanel keys={song.keys} highlightKey="E" />
          </Card>
          <Card title="Keys · override with no files (F)">
            <KeyPanel keys={song.keys} highlightKey="F" />
          </Card>
          {popSong && (
            <Card title={`Composers · ${popSong.title}`}>
              <ComposerPanel composers={popSong.composers} />
            </Card>
          )}
          <Card title="Composers · POP current and past">
            <ComposerPanel
              composers={[
                { id: 'dev-1', name: 'Peter Lindqvist', popMember: 'current' },
                { id: 'dev-2', name: 'Martha Kowal', popMember: 'past' },
                { id: 'dev-3', name: 'Matt Redman', popMember: 'none' },
              ]}
            />
          </Card>
          <Card title="Branch usage · derived and not used">
            <UsagePanel addedByBranchCode={null} usage={derivedUsage} />
          </Card>
          <Card title="Reminder · chorus only">
            <ReminderPanel chorusLine={song.chorusLine} verse1Line={null} />
          </Card>
        </Grid>
      </Section>

      <Section title="Empty">
        <Grid>
          <Card title="Keys">
            <KeyPanel keys={[]} />
          </Card>
          <Card title="Composers">
            <ComposerPanel composers={[]} />
          </Card>
          <Card title="Branch usage">
            <UsagePanel addedByBranchCode={null} usage={[]} />
          </Card>
          <Card title="Reminder">
            <ReminderPanel chorusLine={null} verse1Line={null} />
          </Card>
        </Grid>
      </Section>

      <Section title="Loading">
        <Grid>
          <Card title="Keys">
            <KeyPanelSkeleton />
          </Card>
          <Card title="Composers">
            <ComposerPanelSkeleton />
          </Card>
          <Card title="Branch usage">
            <UsagePanelSkeleton />
          </Card>
          <Card title="Reminder">
            <ReminderPanelSkeleton />
          </Card>
        </Grid>
      </Section>
    </main>
  );
}
