'use client';

import { ArrowDownIcon, ArrowUpIcon } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/components/ui/utils';
import { SORTS, type SearchParams, type Sort } from '@/types/domain';

export type SortDir = NonNullable<SearchParams['dir']>;

/** Sentence-case labels for each sort (REQ-SRCH-04). */
export const SORT_LABELS: Record<Sort, string> = {
  date: 'Date added',
  alpha: 'A–Z',
  key: 'Primary key',
  energy: 'Energy',
  branch_use: 'Branch use',
};

/** Direction a sort starts in when first chosen: newest first for dates, otherwise ascending. */
export const DEFAULT_SORT_DIR: Record<Sort, SortDir> = {
  date: 'desc',
  alpha: 'asc',
  key: 'asc',
  energy: 'asc',
  branch_use: 'asc',
};

const RELEVANCE = 'relevance';
type SortValue = Sort | typeof RELEVANCE;

export interface SortControlProps {
  /** Current sort. Unset means the server default: relevance when there is a query, else date. */
  sort?: Sort;
  dir?: SortDir;
  /**
   * Called with the new sort and direction. `sort` is `undefined` when "Relevance" is picked
   * (both values cleared so the server ranks by relevance).
   */
  onChange(sort: Sort | undefined, dir: SortDir | undefined): void;
  /** A free-text query is present, so "Relevance" is offered and is the unset default. */
  hasQuery?: boolean;
  className?: string;
}

function isSort(value: string): value is Sort {
  return (SORTS as readonly string[]).includes(value);
}

/** Sort selector with a direction toggle (REQ-SRCH-04). */
export function SortControl({
  sort,
  dir,
  onChange,
  hasQuery = false,
  className,
}: SortControlProps) {
  const labelId = useId();
  const relevance = sort === undefined && hasQuery;
  const value: SortValue = sort ?? (hasQuery ? RELEVANCE : 'date');
  const effectiveSort: Sort = sort ?? 'date';
  const effectiveDir: SortDir = dir ?? DEFAULT_SORT_DIR[effectiveSort];
  const nextDir: SortDir = effectiveDir === 'asc' ? 'desc' : 'asc';
  const dirWord = (d: SortDir) => (d === 'asc' ? 'ascending' : 'descending');

  function handleSortChange(next: string) {
    if (next === value) return;
    if (next === RELEVANCE) onChange(undefined, undefined);
    else if (isSort(next)) onChange(next, DEFAULT_SORT_DIR[next]);
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <span id={labelId} className="shrink-0 text-sm text-muted-foreground">
        Sort by
      </span>
      <Select value={value} onValueChange={handleSortChange}>
        <SelectTrigger aria-labelledby={labelId} className="min-w-0 flex-1 sm:w-40 sm:flex-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {hasQuery && <SelectItem value={RELEVANCE}>Relevance</SelectItem>}
          {SORTS.map((s) => (
            <SelectItem key={s} value={s}>
              {SORT_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        disabled={relevance}
        aria-label={
          relevance
            ? 'Sort direction unavailable for relevance'
            : `Sorted ${dirWord(effectiveDir)}, switch to ${dirWord(nextDir)}`
        }
        title={relevance ? undefined : `Sorted ${dirWord(effectiveDir)}`}
        data-dir={relevance ? undefined : effectiveDir}
        onClick={() => onChange(effectiveSort, nextDir)}
      >
        {effectiveDir === 'asc' ? (
          <ArrowUpIcon aria-hidden="true" />
        ) : (
          <ArrowDownIcon aria-hidden="true" />
        )}
      </Button>
    </div>
  );
}
