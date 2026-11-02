'use client';

import { SearchIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { ComposerName } from '@/components/song/ComposerName';
import { EnergyChip } from '@/components/song/EnergyChip';
import { KeyBadge } from '@/components/song/KeyBadge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ROW_TOKEN } from '@/components/ui/tokens';
import { cn } from '@/components/ui/utils';
import { ENERGY_META, type SearchResult, type SongSummary } from '@/types/domain';

import { libraryHref, QUICK_FULL, QUICK_TOP, quickHref, type QuickQuery } from './quickQuery';

/** Delay between the last keystroke and the lookup. */
export const QUICK_DEBOUNCE_MS = 300;

export interface QuickLookupProps {
  /** The lookup in the URL. */
  query: QuickQuery;
  /** Search result for `query.q`; null when there is no text or the search failed. */
  result: SearchResult | null;
  /** The search failed (shows the error state with "Try again"). */
  failed: boolean;
}

/** "Top 12 of 37 matches" / "All 37 matches" / "1 match". */
export function matchSummary(result: SearchResult, full: boolean): string {
  const { total } = result;
  const noun = total === 1 ? 'match' : 'matches';
  if (result.items.length >= total) return total === 1 ? '1 match' : `All ${total} ${noun}`;
  return full
    ? `First ${result.items.length} of ${total} ${noun}`
    : `Top ${result.items.length} of ${total} ${noun}`;
}

/**
 * Quick theme lookup (BR-04; REQ-BR-03): one large box searching themes + lyrics, the top 12
 * songs in large type so the screen can be held up to the music leader, and a "Show full"
 * toggle for every match. Typing is debounced into the URL (`router.replace`); the server page
 * re-runs the search and passes the new result down.
 */
export function QuickLookup({ query, result, failed }: QuickLookupProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inputId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Local draft so typing stays responsive. An incoming `query.q` that isn't what we last
  // sent is an outside change (back button, nav link) and replaces the draft.
  const [text, setText] = useState({ draft: query.q, prev: query.q, sent: query.q });
  if (query.q !== text.prev) {
    setText({
      draft: query.q === text.sent ? text.draft : query.q,
      prev: query.q,
      sent: query.q === text.sent ? text.sent : query.q,
    });
  }
  const draft = text.draft;

  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  // Ready to type on arrival when there's no lookup yet.
  const initiallyEmpty = useRef(query.q === '');
  useEffect(() => {
    if (initiallyEmpty.current) inputRef.current?.focus();
  }, []);

  const go = (next: QuickQuery) => {
    cancel();
    setText((t) => ({ ...t, sent: next.q.trim() }));
    startTransition(() => router.replace(quickHref(next), { scroll: false }));
  };

  const changeText = (q: string) => {
    setText((t) => ({ ...t, draft: q }));
    cancel();
    timer.current = setTimeout(() => go({ q, full: query.full }), QUICK_DEBOUNCE_MS);
  };

  const clear = () => {
    setText((t) => ({ ...t, draft: '' }));
    go({ q: '', full: false });
    inputRef.current?.focus();
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    go({ q: draft, full: query.full });
    inputRef.current?.blur(); // drop the phone keyboard so the results fill the screen
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && draft !== '') {
      e.preventDefault();
      clear();
    }
  };

  const retry = () => startTransition(() => router.refresh());

  const applySuggestion = (q: string) => {
    setText((t) => ({ ...t, draft: q }));
    go({ q, full: query.full });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6">
      <h1 className="text-xl font-semibold">Quick theme lookup</h1>

      <form role="search" aria-label="Quick theme lookup" onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="sr-only">
          Theme or words from a lyric
        </label>
        <div className="relative">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 size-6 -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Type a theme"
            aria-describedby={statusId}
            value={draft}
            onChange={(e) => changeText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-16 w-full min-w-0 rounded-lg border-2 border-input bg-background pr-14 pl-13 text-2xl shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {draft !== '' && (
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Clear"
              onClick={clear}
              className="absolute top-1/2 right-2 size-11 -translate-y-1/2 [&_svg]:size-6"
            >
              <XIcon aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>

      <div id={statusId} aria-live="polite" className="sr-only">
        {pending
          ? 'Searching…'
          : failed
            ? 'Search failed'
            : result
              ? `${matchSummary(result, query.full)} for “${query.q}”`
              : ''}
      </div>

      <Results
        query={query}
        result={result}
        failed={failed}
        pending={pending}
        onRetry={retry}
        onShowFull={(full) => go({ q: query.q, full })}
        onSuggestion={applySuggestion}
      />
    </div>
  );
}

interface ResultsProps extends QuickLookupProps {
  pending: boolean;
  onRetry(): void;
  onShowFull(full: boolean): void;
  onSuggestion(q: string): void;
}

function Results({
  query,
  result,
  failed,
  pending,
  onRetry,
  onShowFull,
  onSuggestion,
}: ResultsProps) {
  if (failed && !pending) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border p-4">
        <p className="text-lg font-medium">Couldn&apos;t search right now.</p>
        <Button size="lg" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (!result) {
    if (pending) return <ResultsSkeleton />;
    return (
      <p className="text-lg text-muted-foreground">
        Type a theme from the word, like “grace” or “the cross”. Song themes and lyrics are
        searched.
      </p>
    );
  }

  if (result.items.length === 0) {
    return (
      <div aria-busy={pending} className={cn('flex flex-col gap-2', pending && 'opacity-60')}>
        <p className="text-lg">
          No songs match “<span className="font-semibold">{query.q}</span>”.
        </p>
        {result.didYouMean ? (
          <p className="text-lg">
            Did you mean{' '}
            <Button
              variant="link"
              className="h-auto min-h-10 px-1 text-lg"
              onClick={() => onSuggestion(result.didYouMean!)}
            >
              {result.didYouMean}
            </Button>
            ?
          </p>
        ) : (
          <p className="text-muted-foreground">Try a shorter or different word.</p>
        )}
      </div>
    );
  }

  const canToggle = query.full || result.total > QUICK_TOP;
  const beyondFull = query.full && result.total > QUICK_FULL;

  return (
    <section
      aria-label="Matching songs"
      aria-busy={pending}
      className={cn('flex flex-col gap-3 transition-opacity', pending && 'opacity-60')}
    >
      <div className="flex min-h-10 flex-wrap items-center justify-between gap-2">
        <p className="text-base text-muted-foreground">{matchSummary(result, query.full)}</p>
        {canToggle && (
          <Button
            variant="outline"
            size="lg"
            aria-pressed={query.full}
            onClick={() => onShowFull(!query.full)}
            className="aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            Show full
          </Button>
        )}
      </div>

      <ol className="flex flex-col gap-2">
        {result.items.map((song, i) => (
          <QuickResult key={song.id} song={song} position={i + 1} />
        ))}
      </ol>

      {beyondFull && (
        <Link
          href={libraryHref(query.q)}
          className="inline-flex min-h-10 items-center self-start rounded-md px-1 text-base font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          See all {result.total} in the library
        </Link>
      )}
    </section>
  );
}

/** One match: big number + big title, then energy, key and composer. Opens the song page. */
function QuickResult({ song, position }: { song: SongSummary; position: number }) {
  return (
    <li>
      <Link
        href={`/songs/${encodeURIComponent(song.id)}`}
        data-song-id={song.id}
        className={cn(
          ROW_TOKEN.surface,
          'flex min-h-16 w-full min-w-0 items-start gap-3 rounded-lg px-3 py-3 outline-none',
          'hover:bg-row/90 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        <span
          aria-hidden="true"
          className="w-8 shrink-0 pt-0.5 text-right text-2xl font-semibold text-row-foreground/70 tabular-nums"
        >
          {position}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-2xl leading-tight font-semibold break-words sm:text-3xl">
            {song.title}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-base">
            <EnergyChip energy={song.energyLevel} bpm={song.tempoBpm} />
            <KeyBadge value={song.primaryKey} />
            {song.energyLevel !== null && (
              <span aria-hidden="true" className="text-row-foreground/80">
                {ENERGY_META[song.energyLevel].label}
              </span>
            )}
          </span>
          <span className="min-w-0 text-base break-words text-row-foreground/90">
            <ComposerName composers={song.composers} max={3} />
            {song.year !== null && <span className="tabular-nums"> · {song.year}</span>}
          </span>
        </span>
      </Link>
    </li>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">Loading results…</span>
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  );
}
