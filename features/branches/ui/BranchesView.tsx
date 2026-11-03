'use client';

import { CalendarDays, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition, type ReactNode } from 'react';

import { PdfViewer } from '@/components/media/PdfViewer';
import { SongRow } from '@/components/song/SongRow';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import type { BranchActivity } from '@/features/branches/server';
import { AddToListMenu } from '@/features/lists/ui/AddToListMenu';
import { useCurrentList } from '@/features/lists/ui/CurrentList';
import { formatEventDate } from '@/features/lists/ui/ListIndex';
import {
  RowPanelBody,
  RowWithPanel,
  useResourceOpener,
  useSongDetailCache,
  type GetSignedResourceUrl,
  type LoadSongDetail,
  type RowPanelKind,
} from '@/features/search/ui/RowPanels';
import type { ActionResult, List, ListItem, SongSummary, UUID } from '@/types/domain';
import type { ListInput } from '@/types/validation';

import { CurrentListBoundary } from './CurrentListBoundary';

/** The list actions behind each row's ADD menu (LIST-01 / LIST-02 server actions). */
export interface BranchAddToListActions {
  addListItem(listId: UUID, songId: UUID): Promise<ActionResult<ListItem>>;
  createList(input: ListInput): Promise<ActionResult<List>>;
  removeListItem(itemId: UUID): Promise<ActionResult<void>>;
}

export interface BranchesViewProps {
  /** `getBranchActivity()` output, or `null` when it couldn't be read (`error` says why). */
  activity: BranchActivity[] | null;
  error?: string | null;
  /** The viewer's branch, left out of "Other branches". `null` shows every branch. */
  ownBranchId: UUID | null;
  /** Window of `recentlyAdded` / `topSongs`, in days, for the headings. */
  days?: number;
  /** Lists the viewer can add to, for the ADD menu. */
  lists: List[];
  /** The session's current list as read on the server. */
  currentList: List | null;
  actions: BranchAddToListActions;
  /** Lazily loads a song's detail for the row panels. */
  loadSong: LoadSongDetail;
  /** `getSignedResourceUrl` (contracts/api.md), for opening uploaded files. */
  getSignedResourceUrl: GetSignedResourceUrl;
  /** Offer "Edit song" in the row panels (LIB-21). Pass `can(user, 'song:write')`. */
  canEditSongs?: boolean;
}

/** Which section of which branch card a row is in; the same song can show in several. */
type Section = 'recent' | 'top';

interface OpenPanel {
  rowKey: string;
  songId: UUID;
  kind: RowPanelKind;
}

const DEFAULT_DAYS = 90;

/** Branches other than the viewer's, in the order given (by name). */
export function otherBranches(
  activity: readonly BranchActivity[],
  ownBranchId: UUID | null,
): BranchActivity[] {
  return activity.filter((a) => a.branch.id !== ownBranchId);
}

export function setlistCount(n: number): string {
  return n === 1 ? '1 setlist' : `${n} setlists`;
}

function songCount(n: number): string {
  return n === 1 ? '1 song' : `${n} songs`;
}

/** Element id of a branch card, for the jump links. */
export function branchAnchor(code: string): string {
  return `branch-${code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

/**
 * "Other branches" (BR-02; REQ-BR-01): one card per branch with its recently added songs,
 * upcoming setlists and most-used songs. Song rows work like the library's: every region opens
 * its detail panel, and ADD opens the Add-to-List menu.
 */
export function BranchesView(props: BranchesViewProps) {
  return (
    <CurrentListBoundary initial={props.currentList}>
      <BranchesBody {...props} />
    </CurrentListBoundary>
  );
}

function BranchesBody({
  activity,
  error = null,
  ownBranchId,
  days = DEFAULT_DAYS,
  lists: initialLists,
  actions,
  loadSong,
  getSignedResourceUrl,
  canEditSongs = false,
}: BranchesViewProps) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const retry = useCallback(() => startRetry(() => router.refresh()), [router]);

  // ----- Add to list -----
  const { current, setCurrent } = useCurrentList();
  const [created, setCreated] = useState<List[]>([]);
  const lists = [...created, ...initialLists.filter((l) => !created.some((c) => c.id === l.id))];

  const onCreate = useCallback(
    async (input: ListInput): Promise<ActionResult<List>> => {
      const result = await actions.createList(input);
      if (result.ok) {
        // A new list becomes the session's current list (REQ-LIST-01).
        setCurrent(result.data);
        setCreated((prev) => [result.data, ...prev]);
      }
      return result;
    },
    [actions, setCurrent],
  );
  const onUndo = useCallback(
    (_listId: UUID, added: unknown) => actions.removeListItem((added as ListItem).id),
    [actions],
  );

  const addSlot = (song: SongSummary) => (
    <AddToListMenu
      songId={song.id}
      songTitle={song.title}
      current={current}
      lists={lists}
      onAdd={(listId) => actions.addListItem(listId, song.id)}
      onCreate={onCreate}
      onUndo={onUndo}
    />
  );

  // ----- Row panels -----
  const [panel, setPanel] = useState<OpenPanel | null>(null);
  const details = useSongDetailCache(loadSong);
  const opener = useResourceOpener(getSignedResourceUrl);

  // A PDF opens over the page: close the panel so focus and the viewer don't fight.
  const { pdf, closePdf } = opener;
  const [prevPdf, setPrevPdf] = useState(pdf);
  if (prevPdf !== pdf) {
    setPrevPdf(pdf);
    if (pdf) setPanel(null);
  }

  const renderRow = (song: SongSummary, rowKey: string, lead?: ReactNode) => {
    const openKind = panel?.rowKey === rowKey ? panel.kind : null;
    const open = (kind: RowPanelKind) => {
      details.ensure(song.id);
      setPanel({ rowKey, songId: song.id, kind });
    };
    return (
      <RowWithPanel
        openKind={openKind}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPanel((p) => (p?.rowKey === rowKey ? null : p));
        }}
        row={
          <SongRow
            song={song}
            onKey={() => open('key')}
            onTitle={() => open('title')}
            onComposer={() => open('composer')}
            onResources={() => open('resources')}
            onUsage={() => open('usage')}
            addSlot={addSlot(song)}
            dragHandle={lead}
          />
        }
      >
        {openKind ? (
          <RowPanelBody
            kind={openKind}
            summary={song}
            state={details.get(song.id)}
            onRetry={() => details.ensure(song.id)}
            opener={opener}
            canEdit={canEditSongs}
          />
        ) : null}
      </RowWithPanel>
    );
  };

  const rowKey = (branchId: UUID, section: Section, songId: UUID) =>
    `${branchId}:${section}:${songId}`;

  // ----- Render -----
  let body: ReactNode;
  if (activity === null) {
    body = (
      <div role="alert" className="rounded-md border border-destructive/40 p-4">
        <p className="flex items-center gap-2 font-medium">
          <TriangleAlert aria-hidden className="size-4 text-destructive" />
          {error ?? 'Something went wrong. Please try again.'}
        </p>
        <Button className="mt-3 min-h-tap" onClick={retry} disabled={retrying}>
          {retrying ? 'Trying again…' : 'Try again'}
        </Button>
      </div>
    );
  } else {
    const others = otherBranches(activity, ownBranchId);
    body =
      others.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-muted-foreground">
          There are no other branches yet.
        </p>
      ) : (
        <>
          {others.length > 1 ? (
            <nav aria-label="Jump to branch" className="flex flex-wrap gap-2">
              {others.map(({ branch }) => (
                <a
                  key={branch.id}
                  href={`#${branchAnchor(branch.code)}`}
                  className="inline-flex min-h-tap items-center rounded-md border px-3 text-sm font-medium hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                >
                  {branch.name}
                </a>
              ))}
            </nav>
          ) : null}
          {others.map((a) => (
            <BranchCard
              key={a.branch.id}
              activity={a}
              days={days}
              renderSong={(song, section, lead) =>
                renderRow(song, rowKey(a.branch.id, section, song.id), lead)
              }
            />
          ))}
        </>
      );
  }

  return (
    <div
      className={cn(
        'mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-4 px-3 py-4 sm:px-4',
        retrying && 'opacity-90',
      )}
    >
      <header>
        <h1 className="text-xl font-semibold">Other branches</h1>
        <p className="text-sm text-muted-foreground">
          What other branches have added, have coming up and have used most lately.
        </p>
      </header>
      {body}
      {pdf ? (
        <PdfViewer
          url={pdf.url}
          title={`${pdf.song.title} · ${pdf.resource.label}`}
          onClose={closePdf}
        />
      ) : null}
    </div>
  );
}

interface BranchCardProps {
  activity: BranchActivity;
  days: number;
  renderSong(song: SongSummary, section: Section, lead?: ReactNode): ReactNode;
}

function BranchCard({ activity, days, renderSong }: BranchCardProps) {
  const { branch, recentlyAdded, upcoming, topSongs } = activity;
  const headingId = `${branchAnchor(branch.code)}-heading`;
  return (
    <section
      id={branchAnchor(branch.code)}
      aria-labelledby={headingId}
      className="scroll-mt-20 rounded-lg border bg-card p-3 text-card-foreground sm:p-4"
      data-testid="branch-card"
    >
      <h2 id={headingId} className="flex items-baseline gap-2 text-lg font-semibold">
        {branch.name}
        <span className="text-sm font-normal text-muted-foreground">{branch.code}</span>
      </h2>

      <div className="mt-3 flex flex-col gap-5">
        <CardSection title={`Recently added, last ${days} days`}>
          {recentlyAdded.length === 0 ? (
            <Empty>No songs added in the last {days} days.</Empty>
          ) : (
            <ul className="flex flex-col gap-1">
              {recentlyAdded.map((song) => (
                <li key={song.id}>{renderSong(song, 'recent')}</li>
              ))}
            </ul>
          )}
        </CardSection>
        <CardSection title="Upcoming setlists">
          {upcoming.length === 0 ? (
            <Empty>No upcoming setlists.</Empty>
          ) : (
            <ul className="flex flex-col gap-1">
              {upcoming.map((list) => (
                <li key={list.id}>
                  <Link
                    href={`/lists/${list.id}`}
                    className="flex min-h-tap flex-wrap items-center gap-x-3 gap-y-0.5 rounded-md px-2 py-1.5 hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
                      <CalendarDays aria-hidden className="size-4" />
                      {list.eventDate ? (
                        <time dateTime={list.eventDate} suppressHydrationWarning>
                          {formatEventDate(list.eventDate)}
                        </time>
                      ) : (
                        'No date'
                      )}
                    </span>
                    <span className="min-w-0 font-medium break-words">{list.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {songCount(list.itemCount)} · {list.ownerName}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardSection>

        <CardSection title={`Most used, last ${days} days`}>
          {topSongs.length === 0 ? (
            <Empty>No setlists in the last {days} days.</Empty>
          ) : (
            <ul className="flex flex-col gap-1">
              {topSongs.map((song) => (
                <li key={song.id}>
                  {renderSong(
                    song,
                    'top',
                    <span
                      className="inline-flex min-w-8 justify-center text-sm font-semibold tabular-nums"
                      title={`On ${setlistCount(song.count)}`}
                      data-testid="use-count"
                    >
                      <span aria-hidden>{song.count}×</span>
                      <span className="sr-only">On {setlistCount(song.count)}</span>
                    </span>,
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardSection>
      </div>
    </section>
  );
}

function CardSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h3 className="text-sm font-semibold tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-2 text-sm text-muted-foreground">{children}</p>;
}
