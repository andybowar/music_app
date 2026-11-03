'use client';

import { ArrowLeftIcon, ExternalLink, Pencil, TriangleAlert, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { InlineAudio } from '@/components/media/InlineAudio';
import { ResponsivePanel } from '@/components/ResponsivePanel';
import { LyricsViewer } from '@/components/song/LyricsViewer';
import { ComposerPanel, ComposerPanelSkeleton } from '@/components/song/panels/ComposerPanel';
import { KeyPanel, KeyPanelSkeleton } from '@/components/song/panels/KeyPanel';
import { ReminderPanel, ReminderPanelSkeleton } from '@/components/song/panels/ReminderPanel';
import { ResourcesPanel, ResourcesPanelSkeleton } from '@/components/song/panels/ResourcesPanel';
import { UsagePanel, UsagePanelSkeleton } from '@/components/song/panels/UsagePanel';
import { Button } from '@/components/ui/button';
import { openPlan } from '@/features/songs/ui/SongPage';
import {
  SECTIONS,
  type ActionResult,
  type Resource,
  type SongDetail,
  type SongSummary,
  type UUID,
} from '@/types/domain';

// ---------- Types ----------

/** Which row region opened the panel (REQ-ROW-02). */
export type RowPanelKind = 'key' | 'title' | 'composer' | 'resources' | 'usage';

/** Panel headings, sentence case. */
export const ROW_PANEL_TITLE: Record<RowPanelKind, string> = {
  key: 'Keys and first chords',
  title: 'First lines',
  composer: 'Composers',
  resources: 'Resources',
  usage: 'Branch usage',
};

/** The open panel: one per page, on one song. */
export interface OpenRowPanel {
  songId: UUID;
  kind: RowPanelKind;
}

export type SongDetailState =
  | { status: 'loading' }
  | { status: 'ready'; song: SongDetail }
  | { status: 'error'; message: string };

export type LoadSongDetail = (id: UUID) => Promise<ActionResult<SongDetail>>;
export type SignedUrlResult = ActionResult<{ url: string; expiresAt: string }>;
export type GetSignedResourceUrl = (id: UUID) => Promise<SignedUrlResult>;

const GENERIC_ERROR = 'Something went wrong. Please try again.';

// ---------- Song detail cache ----------

export interface SongDetailCache {
  /** Cached state for a song; `undefined` until first requested. */
  get(id: UUID): SongDetailState | undefined;
  /** Fetch the song unless it is cached or in flight. Errors are retried on the next call. */
  ensure(id: UUID): void;
}

/**
 * Lazily fetched `SongDetail`s, cached per song for the life of the page, so reopening a panel
 * (or a different panel on the same song) doesn't refetch. Failed fetches are not cached.
 */
export function useSongDetailCache(loadSong: LoadSongDetail): SongDetailCache {
  const [entries, setEntries] = useState<ReadonlyMap<UUID, SongDetailState>>(() => new Map());
  const inFlight = useRef(new Set<UUID>());
  const ready = useRef(new Set<UUID>());

  const put = useCallback((id: UUID, state: SongDetailState) => {
    setEntries((prev) => new Map(prev).set(id, state));
  }, []);

  const ensure = useCallback(
    (id: UUID) => {
      if (inFlight.current.has(id) || ready.current.has(id)) return;
      inFlight.current.add(id);
      put(id, { status: 'loading' });
      void (async () => {
        let result: ActionResult<SongDetail>;
        try {
          result = await loadSong(id);
        } catch {
          result = { ok: false, error: { code: 'INTERNAL', message: GENERIC_ERROR } };
        }
        inFlight.current.delete(id);
        if (result.ok) {
          ready.current.add(id);
          put(id, { status: 'ready', song: result.data });
        } else {
          put(id, { status: 'error', message: result.error.message });
        }
      })();
    },
    [loadSong, put],
  );

  const get = useCallback((id: UUID) => entries.get(id), [entries]);
  return { get, ensure };
}

// ---------- Opening resources ----------

/** Signed URLs are reused until this close to expiry. */
const URL_REUSE_MARGIN_MS = 60_000;

export interface OpenedResource {
  song: Pick<SongSummary, 'id' | 'title'>;
  resource: Resource;
  url: string;
}

export interface ResourceOpener {
  /** Opens a file per REQ-ROW-04: PDF viewer, inline audio, new tab or download. */
  open(song: Pick<SongSummary, 'id' | 'title'>, r: Resource): Promise<void>;
  /** Resource whose signed URL is being fetched. */
  pending: UUID | null;
  pdf: OpenedResource | null;
  audio: OpenedResource | null;
  closePdf(): void;
  closeAudio(): void;
}

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

/**
 * What opening a file does, shared with the song page (`openPlan`). Uploaded files are only ever
 * opened through a short-lived signed URL, fetched on demand and reused until near expiry.
 */
export function useResourceOpener(getSignedResourceUrl: GetSignedResourceUrl): ResourceOpener {
  const [pdf, setPdf] = useState<OpenedResource | null>(null);
  const [audio, setAudio] = useState<OpenedResource | null>(null);
  const [pending, setPending] = useState<UUID | null>(null);
  const pendingRef = useRef<UUID | null>(null);
  const signed = useRef(new Map<UUID, { url: string; expiresAt: number }>());

  const signedUrl = useCallback(
    async (r: Resource): Promise<string | null> => {
      const cached = signed.current.get(r.id);
      if (cached && cached.expiresAt - Date.now() > URL_REUSE_MARGIN_MS) return cached.url;
      pendingRef.current = r.id;
      setPending(r.id);
      let result: SignedUrlResult;
      try {
        result = await getSignedResourceUrl(r.id);
      } catch {
        result = { ok: false, error: { code: 'INTERNAL', message: GENERIC_ERROR } };
      } finally {
        pendingRef.current = null;
        setPending(null);
      }
      if (!result.ok) {
        toast.error(`Couldn't open ${r.label}`, { description: result.error.message });
        return null;
      }
      const expiresAt = Date.parse(result.data.expiresAt);
      signed.current.set(r.id, {
        url: result.data.url,
        expiresAt: Number.isNaN(expiresAt) ? 0 : expiresAt,
      });
      return result.data.url;
    },
    [getSignedResourceUrl],
  );

  const open = useCallback(
    async (song: Pick<SongSummary, 'id' | 'title'>, r: Resource) => {
      if (pendingRef.current) return;
      const plan = openPlan(r);
      switch (plan.type) {
        case 'none':
          return;
        case 'link':
          openInNewTab(plan.url);
          return;
        case 'audio':
          if (!plan.signed) {
            setAudio({ song, resource: r, url: plan.url });
            return;
          }
          break;
      }
      const url = await signedUrl(r);
      if (url === null) return;
      if (plan.type === 'pdf') setPdf({ song, resource: r, url });
      else if (plan.type === 'audio') setAudio({ song, resource: r, url });
      else startDownload(url);
    },
    [signedUrl],
  );

  const closePdf = useCallback(() => setPdf(null), []);
  const closeAudio = useCallback(() => setAudio(null), []);
  return { open, pending, pdf, audio, closePdf, closeAudio };
}

// ---------- Panel content ----------

const hasLyrics = (song: SongDetail) => SECTIONS.some((s) => !!song.lyrics[s]?.trim());

function PanelSkeleton({ kind }: { kind: RowPanelKind }) {
  switch (kind) {
    case 'key':
      return <KeyPanelSkeleton />;
    case 'title':
      return <ReminderPanelSkeleton />;
    case 'composer':
      return <ComposerPanelSkeleton />;
    case 'resources':
      return <ResourcesPanelSkeleton />;
    case 'usage':
      return <UsagePanelSkeleton />;
  }
}

function PanelError({ message, onRetry }: { message: string; onRetry(): void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 py-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <TriangleAlert aria-hidden="true" className="size-4 text-destructive" />
        Couldn’t load this song
      </p>
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button type="button" variant="outline" className="min-h-tap" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function ResourcesBody({
  song,
  opener,
}: {
  song: SongDetail;
  opener: Pick<ResourceOpener, 'open' | 'pending' | 'audio' | 'closeAudio'>;
}) {
  const [showLyrics, setShowLyrics] = useState(false);
  const audio = opener.audio?.song.id === song.id ? opener.audio : null;

  if (showLyrics) {
    return (
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          variant="ghost"
          className="min-h-tap self-start"
          onClick={() => setShowLyrics(false)}
          autoFocus
        >
          <ArrowLeftIcon aria-hidden />
          Back to files
        </Button>
        <LyricsViewer lyrics={song.lyrics} arrangement={song.arrangement} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {audio ? (
        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-2" data-testid="now-playing">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-medium text-muted-foreground">Now playing</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-tap"
              aria-label="Close player"
              onClick={opener.closeAudio}
            >
              <XIcon aria-hidden />
            </Button>
          </div>
          <InlineAudio url={audio.url} title={`${song.title} · ${audio.resource.label}`} />
        </div>
      ) : null}
      <div aria-busy={opener.pending !== null || undefined}>
        <ResourcesPanel
          resources={song.resources}
          keys={song.keys}
          onOpen={(r) => void opener.open(song, r)}
          onShowLyrics={() => setShowLyrics(true)}
          hasLyrics={hasLyrics(song)}
        />
      </div>
    </div>
  );
}

export interface RowPanelBodyProps {
  kind: RowPanelKind;
  /** The row's song, for values the summary already has (primary key). */
  summary: SongSummary;
  /** Lazily loaded detail; `undefined` is treated as loading. */
  state: SongDetailState | undefined;
  onRetry(): void;
  opener: Pick<ResourceOpener, 'open' | 'pending' | 'audio' | 'closeAudio'>;
  /** Also offer "Edit song" (→ `/songs/[id]/edit`). Pass `can(user, 'song:write')` (LIB-21). */
  canEdit?: boolean;
}

/** Song page and edit links under every row panel (LIB-21): the way from a row to the song. */
export function SongPanelLinks({ songId, canEdit = false }: { songId: string; canEdit?: boolean }) {
  const href = `/songs/${encodeURIComponent(songId)}`;
  const link =
    'inline-flex min-h-tap items-center gap-1.5 rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4';
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 border-t pt-2" data-testid="song-panel-links">
      <Link href={href} className={link}>
        <ExternalLink aria-hidden />
        Open song page
      </Link>
      {canEdit ? (
        <Link href={`${href}/edit`} className={link}>
          <Pencil aria-hidden />
          Edit song
        </Link>
      ) : null}
    </div>
  );
}

/** One detail panel's content: skeleton while the song loads, error with retry, or the panel. */
export function RowPanelBody({
  kind,
  summary,
  state,
  onRetry,
  opener,
  canEdit = false,
}: RowPanelBodyProps) {
  return (
    <>
      <RowPanelContent
        kind={kind}
        summary={summary}
        state={state}
        onRetry={onRetry}
        opener={opener}
      />
      <SongPanelLinks songId={summary.id} canEdit={canEdit} />
    </>
  );
}

function RowPanelContent({ kind, summary, state, onRetry, opener }: RowPanelBodyProps) {
  if (!state || state.status === 'loading') return <PanelSkeleton kind={kind} />;
  if (state.status === 'error') return <PanelError message={state.message} onRetry={onRetry} />;
  const song = state.song;
  switch (kind) {
    case 'key':
      return (
        <KeyPanel
          keys={song.keys}
          highlightKey={summary.primaryKey ?? song.primaryKey ?? undefined}
        />
      );
    case 'title':
      return <ReminderPanel chorusLine={song.chorusLine} verse1Line={song.verse1Line} />;
    case 'composer':
      return <ComposerPanel composers={song.composers} />;
    case 'resources':
      return <ResourcesBody song={song} opener={opener} />;
    case 'usage':
      return <UsagePanel addedByBranchCode={song.addedByBranchCode} usage={song.usage} />;
  }
}

export interface RowWithPanelProps {
  /** The open panel's kind when it is on this song, else `null`. */
  openKind: RowPanelKind | null;
  onOpenChange(open: boolean): void;
  /** The row itself (the popover is positioned against it). */
  row: ReactNode;
  children: ReactNode;
}

/**
 * Wraps a `SongRow` in a controlled `ResponsivePanel` anchored to it. Always rendered (open or
 * not) so the row keeps its DOM, and focus returns to the region that opened the panel.
 */
export function RowWithPanel({ openKind, onOpenChange, row, children }: RowWithPanelProps) {
  return (
    <ResponsivePanel
      open={openKind !== null}
      onOpenChange={onOpenChange}
      anchor={<div className="min-w-0">{row}</div>}
      title={openKind ? ROW_PANEL_TITLE[openKind] : ROW_PANEL_TITLE.resources}
    >
      {openKind ? children : null}
    </ResponsivePanel>
  );
}
