'use client';

import Link from 'next/link';
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { PencilIcon, XIcon } from 'lucide-react';
import { toast } from 'sonner';

import { InlineAudio } from '@/components/media/InlineAudio';
import { PdfViewer } from '@/components/media/PdfViewer';
import { ComposerName } from '@/components/song/ComposerName';
import { BranchCode } from '@/components/song/BranchCode';
import { EnergyChip } from '@/components/song/EnergyChip';
import { KeyBadge } from '@/components/song/KeyBadge';
import { LyricsViewer, LyricsViewerSkeleton } from '@/components/song/LyricsViewer';
import { TimeSigBadge } from '@/components/song/TimeSigBadge';
import { ComposerPanel } from '@/components/song/panels/ComposerPanel';
import { KeyPanel } from '@/components/song/panels/KeyPanel';
import { ReminderPanel } from '@/components/song/panels/ReminderPanel';
import {
  ResourcesPanel,
  ResourcesPanelSkeleton,
  resourceAction,
} from '@/components/song/panels/ResourcesPanel';
import { UsagePanel } from '@/components/song/panels/UsagePanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ROW_TOKEN } from '@/components/ui/tokens';
import { cn } from '@/components/ui/utils';
import {
  ENERGY_META,
  SECTIONS,
  SECTION_LABEL,
  type ActionResult,
  type Resource,
  type Section,
  type SongDetail,
  type Theme,
  type UUID,
} from '@/types/domain';

export type SignedUrlResult = ActionResult<{ url: string; expiresAt: string }>;

export interface SongPageProps {
  song: SongDetail;
  /** Contributors and up (`song:write`): shows the Edit button and the add-files link. */
  canEdit: boolean;
  /** `audit:read` (contributors and up): shows the History tab (REQ-LIB-12, filled by LIB-19). */
  canViewHistory: boolean;
  /** `getSignedResourceUrl` from `features/resources/server/files.ts` (contracts/api.md). */
  getSignedResourceUrl(id: UUID): Promise<SignedUrlResult>;
  /** Content of the History tab. LIB-19 fills this; until then a placeholder shows. */
  historySlot?: ReactNode;
}

/**
 * What opening a resource does on the song page (REQ-ROW-04). Uploaded files are only ever
 * opened through a short-lived signed URL (`signed: true`); `storagePath` is never used as a URL.
 * External links (`format: 'url'`, or a row with only `url`) open in a new tab.
 */
export type OpenPlan =
  | { type: 'pdf' | 'audio' | 'download'; signed: true }
  | { type: 'audio'; signed: false; url: string }
  | { type: 'link'; url: string }
  | { type: 'none' };

export function openPlan(r: Pick<Resource, 'format' | 'url' | 'storagePath'>): OpenPlan {
  const action = resourceAction(r);
  if (action === 'unavailable') return { type: 'none' };
  if (action === 'link') return r.url ? { type: 'link', url: r.url } : { type: 'none' };
  if (r.storagePath) {
    if (action === 'view') return { type: 'pdf', signed: true };
    if (action === 'play') return { type: 'audio', signed: true };
    return { type: 'download', signed: true };
  }
  // No stored file, only an external URL (e.g. a hosted MP3 or PDF).
  if (!r.url) return { type: 'none' };
  if (action === 'play') return { type: 'audio', signed: false, url: r.url };
  return { type: 'link', url: r.url };
}

/** Signed URLs are reused until this close to expiry. */
const URL_REUSE_MARGIN_MS = 60_000;

/** Themes grouped by section, in section order (chorus, verse 1–5, bridge). */
export function themesBySection(
  themes: SongDetail['themes'],
): Array<{ section: Section; themes: Theme[] }> {
  return SECTIONS.map((section) => ({
    section,
    themes: themes
      .filter((t) => t.section === section)
      .map((t) => t.theme)
      .sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.themes.length > 0);
}

const hasLyrics = (song: SongDetail) => SECTIONS.some((s) => !!song.lyrics[s]?.trim());

function startDownload(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function openInNewTab(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function Panel({
  title,
  id,
  children,
  className,
}: {
  title: string;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      tabIndex={id ? -1 : undefined}
      className={cn('flex min-w-0 flex-col gap-3 rounded-lg border p-4 outline-none', className)}
    >
      <h2 id={headingId} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SongHeader({ song, canEdit }: { song: SongDetail; canEdit: boolean }) {
  const primaryKey = song.keys.find((k) => k.isPrimary)?.key ?? song.primaryKey;
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold break-words">{song.title}</h1>
          {song.altTitles.length > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Also known as {song.altTitles.join(', ')}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <Button asChild variant="outline" className="min-h-tap">
            <Link href={`/songs/${song.id}/edit`}>
              <PencilIcon aria-hidden />
              Edit
            </Link>
          </Button>
        ) : null}
      </div>

      <div
        data-testid="song-atoms"
        className={cn(
          ROW_TOKEN.surface,
          'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-3 py-2',
        )}
      >
        <EnergyChip energy={song.energyLevel} bpm={song.tempoBpm} />
        <TimeSigBadge value={song.timeSignature} />
        <KeyBadge value={primaryKey} />
        <span className="min-w-0 text-sm">
          <ComposerName composers={song.composers} max={song.composers.length || 1} />
        </span>
        {song.year !== null ? (
          <span className="text-sm text-row-foreground/80 tabular-nums">{song.year}</span>
        ) : null}
        <span className="ml-auto">
          <BranchCode code={song.addedByBranchCode} />
        </span>
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Energy</dt>
        <dd>
          {song.energyLevel ? (
            ENERGY_META[song.energyLevel].label
          ) : (
            <span className="text-muted-foreground">Not set</span>
          )}
        </dd>
        {song.energyNotes?.trim() ? (
          <>
            <dt className="text-muted-foreground">Energy notes</dt>
            <dd className="break-words">{song.energyNotes}</dd>
          </>
        ) : null}
        {song.sourceGroup?.trim() ? (
          <>
            <dt className="text-muted-foreground">Source</dt>
            <dd className="break-words">{song.sourceGroup}</dd>
          </>
        ) : null}
      </dl>
    </header>
  );
}

function ThemesList({ themes }: { themes: SongDetail['themes'] }) {
  const groups = themesBySection(themes);
  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No themes tagged yet.</p>;
  }
  return (
    <dl className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.section} className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-muted-foreground">{SECTION_LABEL[g.section]}</dt>
          <dd className="flex flex-wrap gap-1.5">
            {g.themes.map((t) => (
              <Badge key={t.id} variant="secondary">
                {t.name}
              </Badge>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

type Opened = { resource: Resource; url: string };

/**
 * Full view of one song (LIB-18; REQ-ROW-03, REQ-ROW-04): header with the row atoms, every
 * detail panel inline, lyrics in arrangement order, and files that open in place: PDFs in
 * `PdfViewer`, audio in `InlineAudio`, projection files download and links open in a new tab.
 * Uploaded files are fetched through `getSignedResourceUrl` only when opened.
 */
export function SongPage({
  song,
  canEdit,
  canViewHistory,
  getSignedResourceUrl,
  historySlot,
}: SongPageProps) {
  const [pdf, setPdf] = useState<Opened | null>(null);
  const [audio, setAudio] = useState<Opened | null>(null);
  const [pending, setPending] = useState<UUID | null>(null);
  const [status, setStatus] = useState('');
  const signed = useRef(new Map<UUID, { url: string; expiresAt: number }>());
  const lyricsId = useId().replace(/:/g, '') + '-lyrics';

  const signedUrl = useCallback(
    async (r: Resource): Promise<string | null> => {
      const cached = signed.current.get(r.id);
      if (cached && cached.expiresAt - Date.now() > URL_REUSE_MARGIN_MS) return cached.url;
      setPending(r.id);
      setStatus(`Opening ${r.label}…`);
      let result: SignedUrlResult;
      try {
        result = await getSignedResourceUrl(r.id);
      } catch {
        result = {
          ok: false,
          error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' },
        };
      } finally {
        setPending(null);
      }
      if (!result.ok) {
        const message = `Couldn't open ${r.label}. ${result.error.message}`;
        setStatus(message);
        toast.error(`Couldn't open ${r.label}`, { description: result.error.message });
        return null;
      }
      const expiresAt = Date.parse(result.data.expiresAt);
      signed.current.set(r.id, {
        url: result.data.url,
        expiresAt: Number.isNaN(expiresAt) ? 0 : expiresAt,
      });
      setStatus('');
      return result.data.url;
    },
    [getSignedResourceUrl],
  );

  const open = useCallback(
    async (r: Resource) => {
      if (pending) return;
      const plan = openPlan(r);
      switch (plan.type) {
        case 'none':
          return;
        case 'link':
          openInNewTab(plan.url);
          return;
        case 'audio':
          if (!plan.signed) {
            setAudio({ resource: r, url: plan.url });
            return;
          }
          break;
      }
      const url = await signedUrl(r);
      if (url === null) return;
      if (plan.type === 'pdf') setPdf({ resource: r, url });
      else if (plan.type === 'audio') setAudio({ resource: r, url });
      else {
        startDownload(url);
        setStatus(`Downloading ${r.label}`);
      }
    },
    [pending, signedUrl],
  );

  const showLyrics = useCallback(() => {
    const el = document.getElementById(lyricsId);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    el?.focus({ preventScroll: true });
  }, [lyricsId]);

  const primaryKey = song.keys.find((k) => k.isPrimary)?.key ?? song.primaryKey ?? undefined;

  const details = (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <Panel title="Lyrics" id={lyricsId}>
          <LyricsViewer lyrics={song.lyrics} arrangement={song.arrangement} />
        </Panel>
        <Panel title="Themes">
          <ThemesList themes={song.themes} />
        </Panel>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Panel title="Files">
          {audio ? (
            <div
              className="flex flex-col gap-2 rounded-md bg-muted/50 p-2"
              data-testid="now-playing"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-muted-foreground">Now playing</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-tap"
                  aria-label="Close player"
                  onClick={() => setAudio(null)}
                >
                  <XIcon aria-hidden />
                </Button>
              </div>
              <InlineAudio url={audio.url} title={`${song.title} · ${audio.resource.label}`} />
            </div>
          ) : null}
          <div aria-busy={pending !== null || undefined}>
            <ResourcesPanel
              resources={song.resources}
              keys={song.keys}
              onOpen={(r) => void open(r)}
              onShowLyrics={showLyrics}
              hasLyrics={hasLyrics(song)}
              addFilesSlot={
                canEdit ? (
                  <Link
                    href={`/songs/${song.id}/edit`}
                    className="font-medium underline underline-offset-4"
                  >
                    Add files
                  </Link>
                ) : undefined
              }
            />
          </div>
        </Panel>
        <Panel title="Keys and first chords">
          <KeyPanel keys={song.keys} highlightKey={primaryKey} />
        </Panel>
        <Panel title="Composers">
          <ComposerPanel composers={song.composers} />
        </Panel>
        <Panel title="First lines">
          <ReminderPanel chorusLine={song.chorusLine} verse1Line={song.verse1Line} />
        </Panel>
        <Panel title="Branch usage">
          <UsagePanel addedByBranchCode={song.addedByBranchCode} usage={song.usage} />
        </Panel>
      </div>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6" data-song-id={song.id}>
      <SongHeader song={song} canEdit={canEdit} />

      {canViewHistory ? (
        <Tabs defaultValue="song">
          <TabsList
            aria-label="Song views"
            className="group-data-[orientation=horizontal]/tabs:h-auto"
          >
            <TabsTrigger value="song" className="min-h-tap px-4">
              Song
            </TabsTrigger>
            <TabsTrigger value="history" className="min-h-tap px-4">
              History
            </TabsTrigger>
          </TabsList>
          <TabsContent value="song" className="pt-2">
            {details}
          </TabsContent>
          <TabsContent value="history" className="pt-2">
            {/* LIB-19 fills this slot with the song's change history. */}
            {historySlot ?? (
              <p className="text-sm text-muted-foreground">No change history to show yet.</p>
            )}
          </TabsContent>
        </Tabs>
      ) : (
        details
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {status}
      </p>

      {pdf ? (
        <PdfViewer
          url={pdf.url}
          title={`${song.title} · ${pdf.resource.label}`}
          onClose={() => setPdf(null)}
        />
      ) : null}
    </div>
  );
}

/** Loading state for the song page (e.g. a route `loading.tsx`). */
export function SongPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading song…
      </span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="rounded-lg border p-4">
          <LyricsViewerSkeleton />
        </div>
        <div className="rounded-lg border p-4">
          <ResourcesPanelSkeleton />
        </div>
      </div>
    </div>
  );
}

/** Error state when the song couldn't be loaded. `retryHref` reloads the page. */
export function SongPageError({ retryHref }: { retryHref: string }) {
  return (
    <div role="alert" className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">Couldn&apos;t load this song</h1>
      <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Please try again.</p>
      <Button asChild className="mt-4 min-h-tap">
        <a href={retryHref}>Try again</a>
      </Button>
    </div>
  );
}
