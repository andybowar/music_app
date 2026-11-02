'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/utils';
import type { ListScope } from '@/features/lists/server/lists';
import type { ActionResult, ISODate, List, ListType, UUID } from '@/types/domain';
import type { ListInput } from '@/types/validation';

import { CreateListDialog } from './CreateListDialog';
import { useCurrentList, type CurrentListContextValue } from './CurrentList';

/**
 * Open Setlist / Open Playlist (REQ-LIST-07, LIST-08): the caller's saved lists, upcoming
 * events first, with "Set as current" on each row and a create button.
 *
 * Setlists get scope tabs (Mine / My branch / All branches) that are plain links
 * (`/lists?type=setlist&scope=…`), so the server page loads each scope. Playlists are private to
 * their owner (REQ-LIST-08), so they have no tabs.
 */

export interface ListIndexProps {
  type: ListType;
  /** Selected tab (setlists only; playlists always show the caller's own). */
  scope: ListScope;
  /** In the order `listLists` returns: upcoming soonest first, then past latest first, then undated. */
  lists: List[];
  /** Today's date (UTC, like `listLists`), which splits upcoming from past events. */
  today: ISODate;
  /** The session's current list id, from the `current_list` cookie. */
  currentListId: UUID | null;
  /** Show skeleton rows instead of `lists`. */
  loading?: boolean;
  /** Replaces the rows with an error and a retry button. */
  error?: string | null;
  /** Make a list the session's current list. */
  onSetCurrent(list: List): Promise<ActionResult<unknown>>;
  /** Usually `createList` (LIST-01). The new list becomes current and opens. */
  onCreate(input: ListInput): Promise<ActionResult<List>>;
}

export const LIST_SCOPE_TABS: readonly { scope: ListScope; label: string }[] = [
  { scope: 'mine', label: 'Mine' },
  { scope: 'branch', label: 'My branch' },
  { scope: 'all', label: 'All branches' },
];

const NOUN: Record<ListType, string> = { setlist: 'setlist', playlist: 'playlist' };

/** URL of the index for a type and (setlist) scope. */
export function listIndexHref(type: ListType, scope?: ListScope): string {
  const params = new URLSearchParams({ type });
  if (type === 'setlist' && scope) params.set('scope', scope);
  return `/lists?${params.toString()}`;
}

export type ListGroup = 'upcoming' | 'past' | 'undated';

const GROUP_LABEL: Record<ListGroup, string> = {
  upcoming: 'Upcoming',
  past: 'Past',
  undated: 'No date',
};

/** Splits lists into upcoming (event date ≥ today), past and undated, keeping their order. */
export function groupLists(lists: readonly List[], today: ISODate): [ListGroup, List[]][] {
  const groups: Record<ListGroup, List[]> = { upcoming: [], past: [], undated: [] };
  for (const list of lists) {
    // ISO dates compare correctly as strings.
    const group: ListGroup =
      list.eventDate === null ? 'undated' : list.eventDate >= today ? 'upcoming' : 'past';
    groups[group].push(list);
  }
  return (['upcoming', 'past', 'undated'] as const)
    .map((g): [ListGroup, List[]] => [g, groups[g]])
    .filter(([, items]) => items.length > 0);
}

/** A plain event date in the user's locale, e.g. "Sun, Apr 19, 2026". No time zone involved. */
export function formatEventDate(date: ISODate): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function songCount(n: number): string {
  return n === 1 ? '1 song' : `${n} songs`;
}

/**
 * `useCurrentList()` when a `CurrentListProvider` is mounted, else null, so the index also works
 * before the shell wires the provider (LIST-09). The hook always runs, so hook order is stable.
 */
function useOptionalCurrentList(): CurrentListContextValue | null {
  try {
    return useCurrentList();
  } catch {
    return null;
  }
}

export function ListIndex({
  type,
  scope,
  lists,
  today,
  currentListId,
  loading = false,
  error = null,
  onSetCurrent,
  onCreate,
}: ListIndexProps) {
  const router = useRouter();
  const provider = useOptionalCurrentList();
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingId, setPendingId] = useState<UUID | null>(null);
  // Optimistic current id; `undefined` means "use what the server/provider says".
  const [localCurrentId, setLocalCurrentId] = useState<UUID | null | undefined>(undefined);

  const noun = NOUN[type];
  const title = type === 'setlist' ? 'Open setlist' : 'Open playlist';
  const currentId =
    localCurrentId !== undefined ? localCurrentId : (provider?.current?.id ?? currentListId);
  const showOwner = type === 'setlist' && scope !== 'mine';

  async function setCurrent(list: List) {
    const previous = localCurrentId;
    setPendingId(list.id);
    setLocalCurrentId(list.id);
    let result: ActionResult<unknown>;
    try {
      result = await onSetCurrent(list);
    } catch {
      result = { ok: false, error: { code: 'INTERNAL', message: 'Something went wrong.' } };
    }
    setPendingId(null);
    if (!result.ok) {
      setLocalCurrentId(previous);
      toast.error(`Couldn't set the current ${noun}. ${result.error.message}`);
      return;
    }
    provider?.setCurrent(list);
    toast.success(`“${list.name}” is now the current ${noun}`);
    router.refresh();
  }

  async function create(input: ListInput): Promise<ActionResult<List>> {
    const result = await onCreate(input);
    if (result.ok) {
      const list = result.data;
      provider?.setCurrent(list);
      setLocalCurrentId(list.id);
      // REQ-LIST-01: a new list becomes current. The dialog already toasts the creation; a
      // failure here only means the cookie isn't set, so it isn't worth a second toast.
      await onSetCurrent(list).catch(() => undefined);
      router.push(`/lists/${list.id}`);
    }
    return result;
  }

  const createButton = (label: string) => (
    <Button type="button" className="min-h-10" onClick={() => setCreateOpen(true)}>
      {label}
    </Button>
  );

  let body: ReactNode;
  if (loading) {
    body = (
      <ul aria-label={`Loading ${noun}s`} aria-busy="true" className="grid gap-2">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-3 rounded-md border p-3">
            <div className="grid flex-1 gap-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-4 w-3/4" />
            </div>
            <Skeleton className="h-10 w-28" />
          </li>
        ))}
      </ul>
    );
  } else if (error) {
    body = (
      <div role="alert" className="grid justify-items-start gap-3 rounded-md border p-4">
        <p className="text-sm">
          Couldn&apos;t load {noun}s. {error}
        </p>
        <Button
          type="button"
          variant="outline"
          className="min-h-10"
          onClick={() => router.refresh()}
        >
          Try again
        </Button>
      </div>
    );
  } else if (lists.length === 0) {
    const message =
      type === 'playlist'
        ? 'You have no playlists yet.'
        : scope === 'mine'
          ? 'You have no setlists yet.'
          : scope === 'branch'
            ? 'No setlists from you or your branch yet.'
            : 'No setlists yet.';
    body = (
      <div className="grid justify-items-center gap-3 rounded-md border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">{message}</p>
        {createButton(`Create ${noun}`)}
      </div>
    );
  } else {
    body = (
      <div className="grid gap-6">
        {groupLists(lists, today).map(([group, items]) => {
          const headingId = `list-group-${group}`;
          return (
            <section key={group} aria-labelledby={headingId} className="grid gap-2">
              <h2 id={headingId} className="text-sm font-medium text-muted-foreground">
                {GROUP_LABEL[group]}
              </h2>
              <ul className="grid gap-2">
                {items.map((list) => {
                  const isCurrent = list.id === currentId;
                  const meta = [
                    list.eventDate ? (
                      <time key="date" dateTime={list.eventDate} suppressHydrationWarning>
                        {formatEventDate(list.eventDate)}
                      </time>
                    ) : null,
                    showOwner && list.branchCode ? (
                      <span key="branch">{list.branchCode}</span>
                    ) : null,
                    showOwner ? <span key="owner">{list.ownerName}</span> : null,
                    <span key="count">{songCount(list.itemCount)}</span>,
                  ].filter(Boolean);
                  return (
                    <li
                      key={list.id}
                      className={cn(
                        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border p-3',
                        isCurrent && 'border-primary',
                      )}
                    >
                      <div className="grid min-w-0 flex-1 basis-48 gap-1">
                        <Link
                          href={`/lists/${list.id}`}
                          className="truncate rounded-sm text-base font-semibold outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
                        >
                          {list.name}
                        </Link>
                        <p className="flex flex-wrap gap-x-2 text-sm text-muted-foreground">
                          {meta.map((m, i) => (
                            <span key={i} className="flex gap-x-2">
                              {i > 0 && <span aria-hidden="true">·</span>}
                              {m}
                            </span>
                          ))}
                        </p>
                      </div>
                      {isCurrent ? (
                        <Badge variant="secondary" className="min-h-10 px-3">
                          Current
                        </Badge>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-10"
                          disabled={pendingId !== null}
                          aria-label={`Set “${list.name}” as current ${noun}`}
                          onClick={() => void setCurrent(list)}
                        >
                          Set as current
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{title}</h1>
        {createButton(`New ${noun}`)}
      </div>

      {type === 'setlist' && (
        <nav aria-label="Setlist scope">
          <ul className="inline-flex w-full rounded-lg bg-muted p-1 sm:w-auto">
            {LIST_SCOPE_TABS.map((tab) => {
              const active = tab.scope === scope;
              return (
                <li key={tab.scope} className="flex-1 sm:flex-none">
                  <Link
                    href={listIndexHref('setlist', tab.scope)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-10 items-center justify-center rounded-md px-3 text-sm font-medium whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
                      active
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tab.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      {body}

      <CreateListDialog
        type={type}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={create}
      />
    </div>
  );
}
