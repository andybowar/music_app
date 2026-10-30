'use client';

import { ChevronDownIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { ENERGY_RING, ENERGY_TOKEN } from '@/components/ui/tokens';
import { DESKTOP_QUERY, useMediaQuery } from '@/components/ui/use-media-query';
import { cn } from '@/components/ui/utils';
import {
  ENERGY_LEVELS,
  ENERGY_META,
  USAGE_LEVELS,
  type EnergyLevel,
  type FacetOptions,
  type SearchParams,
  type UsageLevel,
} from '@/types/domain';

// ---------- Labels ----------

/** Sentence-case labels for each usage level in the Branch use filter. */
export const USAGE_LABELS: Record<UsageLevel, string> = {
  high: 'High',
  low: 'Low',
  rare: 'Rare',
  none: 'Not used',
};

/** Usage levels the server applies when a branch is set and `usage` is not (contracts/types.md). */
export const DEFAULT_USAGE: readonly UsageLevel[] = ['high', 'low', 'rare'];

/** The SearchParams keys this bar controls. Everything else (q, fields, sort…) is left alone. */
export const FILTER_KEYS = [
  'energy',
  'key',
  'decade',
  'branch',
  'usage',
  'chordChorus',
  'chordVerse',
  'chordBridge',
] as const satisfies readonly (keyof SearchParams)[];

type ChordParam = 'chordChorus' | 'chordVerse' | 'chordBridge';

const CHORD_FILTERS: ReadonlyArray<{
  param: ChordParam;
  facet: keyof FacetOptions['chords'];
  label: string;
  chipPrefix: string;
}> = [
  {
    param: 'chordChorus',
    facet: 'chorus',
    label: 'First chord: chorus/refrain',
    chipPrefix: 'Chorus',
  },
  { param: 'chordVerse', facet: 'verse', label: 'First chord: verse', chipPrefix: 'Verse' },
  { param: 'chordBridge', facet: 'bridge', label: 'First chord: bridge', chipPrefix: 'Bridge' },
];

export function decadeLabel(decade: number): string {
  return `${decade}s`;
}

// ---------- Pure helpers ----------

/**
 * Toggle `value` in `selected`, keeping `order`'s ordering (values not in `order` go last, in
 * their existing order). An empty result is `undefined`, so the filter drops out of the URL.
 */
export function toggleValue<T>(
  selected: readonly T[] | undefined,
  value: T,
  order: readonly T[],
): T[] | undefined {
  const current = selected ?? [];
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
  if (next.length === 0) return undefined;
  const rank = (v: T) => {
    const i = order.indexOf(v);
    return i === -1 ? order.length + current.indexOf(v) : i;
  };
  return [...next].sort((a, b) => rank(a) - rank(b));
}

/** Facet options plus any selected values the facets no longer offer, so they can be unchecked. */
export function withSelected<T>(options: readonly T[], selected: readonly T[] | undefined): T[] {
  const extra = (selected ?? []).filter((v) => !options.includes(v));
  return [...options, ...extra];
}

/** Usage levels in effect: explicit `usage`, else the default when a branch is set. */
export function effectiveUsage(params: SearchParams): UsageLevel[] {
  if (!params.branch) return [];
  return params.usage && params.usage.length > 0 ? params.usage : [...DEFAULT_USAGE];
}

/** Number of active filter values (the badge on the mobile trigger). Branch use counts once. */
export function countActiveFilters(params: SearchParams): number {
  return (
    (params.energy?.length ?? 0) +
    (params.key?.length ?? 0) +
    (params.decade?.length ?? 0) +
    (params.branch ? 1 : 0) +
    (params.chordChorus?.length ?? 0) +
    (params.chordVerse?.length ?? 0) +
    (params.chordBridge?.length ?? 0)
  );
}

/** `params` with every filter key explicitly `undefined` (removed by `useSearchState.setParams`). */
export function clearFilters(params: SearchParams): SearchParams {
  const next: SearchParams = { ...params };
  for (const k of FILTER_KEYS) next[k] = undefined;
  next.page = undefined;
  return next;
}

export interface ActiveFilterChip {
  id: string;
  label: string;
  /** Accessible name of the remove button. */
  removeLabel: string;
  energy?: EnergyLevel;
  /** Patch that removes this chip's value. */
  remove: Partial<SearchParams>;
}

/** One chip per active filter value, in bar order. */
export function activeFilterChips(params: SearchParams, facets: FacetOptions): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  for (const e of params.energy ?? []) {
    chips.push({
      id: `energy:${e}`,
      label: ENERGY_META[e].label,
      removeLabel: `Remove energy filter ${ENERGY_META[e].label}`,
      energy: e,
      remove: { energy: toggleValue(params.energy, e, ENERGY_LEVELS) },
    });
  }
  for (const k of params.key ?? []) {
    chips.push({
      id: `key:${k}`,
      label: `Key ${k}`,
      removeLabel: `Remove key filter ${k}`,
      remove: { key: toggleValue(params.key, k, facets.keys) },
    });
  }
  for (const d of params.decade ?? []) {
    chips.push({
      id: `decade:${d}`,
      label: decadeLabel(d),
      removeLabel: `Remove decade filter ${decadeLabel(d)}`,
      remove: { decade: toggleValue(params.decade, d, facets.decades) },
    });
  }
  if (params.branch) {
    const branch = facets.branches.find((b) => b.code === params.branch);
    const levels = effectiveUsage(params)
      .map((u) => USAGE_LABELS[u].toLowerCase())
      .join(', ');
    const name = branch ? `${branch.name} (${branch.code})` : params.branch;
    chips.push({
      id: `branch:${params.branch}`,
      label: `${name}: ${levels}`,
      removeLabel: `Remove branch use filter ${name}`,
      remove: { branch: undefined, usage: undefined },
    });
  }
  for (const c of CHORD_FILTERS) {
    for (const chord of params[c.param] ?? []) {
      chips.push({
        id: `${c.param}:${chord}`,
        label: `${c.chipPrefix} starts on ${chord}`,
        removeLabel: `Remove filter ${c.chipPrefix.toLowerCase()} starts on ${chord}`,
        remove: { [c.param]: toggleValue(params[c.param], chord, facets.chords[c.facet]) },
      });
    }
  }
  return chips;
}

// ---------- Component ----------

export interface FilterBarProps {
  params: SearchParams;
  /** Values to offer in each dropdown (from the facets read helper). */
  facets: FacetOptions;
  /**
   * Called with the full next params. Removed filters are present with value `undefined` and
   * `page` is cleared, so the result can be passed straight to `useSearchState().setParams`.
   */
  onChange(p: SearchParams): void;
  /** Facets are still loading: dropdowns show a skeleton. Active chips stay removable. */
  loading?: boolean;
  /** Facets failed to load. Shown instead of the dropdowns; active chips stay removable. */
  error?: string | null;
  className?: string;
}

interface Group {
  id: string;
  label: string;
  /** Selected count for the trigger badge. */
  count: number;
  /** Shown in the trigger instead of a count when exactly one value is selected. */
  summary?: string;
  body: ReactNode;
}

function EnergySwatch({ energy }: { energy: EnergyLevel }) {
  return (
    <span
      aria-hidden="true"
      data-energy={energy}
      className={cn(
        'inline-block size-3.5 shrink-0 rounded-chip',
        ENERGY_TOKEN[energy].bg,
        ENERGY_RING,
      )}
    />
  );
}

function OptionList<T extends string | number>({
  label,
  options,
  selected,
  onToggle,
  render,
  empty,
  columns = false,
}: {
  label: string;
  options: readonly T[];
  selected: readonly T[] | undefined;
  onToggle(value: T): void;
  render(value: T): ReactNode;
  empty: string;
  columns?: boolean;
}) {
  const baseId = useId();
  if (options.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(columns ? 'grid grid-cols-3 gap-x-2' : 'flex flex-col')}
    >
      {options.map((value) => {
        const id = `${baseId}-${value}`;
        const checked = selected?.includes(value) ?? false;
        return (
          <label
            key={value}
            htmlFor={id}
            className="flex min-h-tap cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
          >
            <Checkbox id={id} checked={checked} onCheckedChange={() => onToggle(value)} />
            {render(value)}
          </label>
        );
      })}
    </div>
  );
}

const ANY_BRANCH = '__any__';

function BranchUseBody({
  params,
  facets,
  update,
}: {
  params: SearchParams;
  facets: FacetOptions;
  update(patch: Partial<SearchParams>): void;
}) {
  const branchLabelId = useId();
  const usage = effectiveUsage(params);
  const known = facets.branches.some((b) => b.code === params.branch);

  if (facets.branches.length === 0 && !params.branch) {
    return <p className="py-2 text-sm text-muted-foreground">No branches yet</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <span id={branchLabelId} className="text-sm text-muted-foreground">
        Branch
      </span>
      <Select
        value={params.branch ?? ANY_BRANCH}
        onValueChange={(v) =>
          update(
            v === ANY_BRANCH
              ? { branch: undefined, usage: undefined }
              : { branch: v, usage: undefined },
          )
        }
      >
        <SelectTrigger aria-labelledby={branchLabelId} className="h-10 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_BRANCH}>Any branch</SelectItem>
          {facets.branches.map((b) => (
            <SelectItem key={b.id} value={b.code}>
              {b.name} ({b.code})
            </SelectItem>
          ))}
          {params.branch && !known && (
            <SelectItem value={params.branch}>{params.branch}</SelectItem>
          )}
        </SelectContent>
      </Select>
      {params.branch ? (
        <>
          <span className="text-sm text-muted-foreground">Used at that branch</span>
          <OptionList
            label="Usage level"
            options={USAGE_LEVELS}
            selected={usage}
            onToggle={(level) => {
              const next = toggleValue(usage, level, USAGE_LEVELS);
              if (!next) return; // at least one level stays on
              update({ usage: next });
            }}
            render={(level) => USAGE_LABELS[level]}
            empty=""
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Pick a branch to filter by how often it uses a song.
        </p>
      )}
    </div>
  );
}

function buildGroups(
  params: SearchParams,
  facets: FacetOptions,
  update: (patch: Partial<SearchParams>) => void,
): Group[] {
  const keys = withSelected(facets.keys, params.key);
  const decades = withSelected(facets.decades, params.decade);
  const single = <T,>(list: readonly T[] | undefined, fmt: (v: T) => string) =>
    list?.length === 1 && list[0] !== undefined ? fmt(list[0]) : undefined;
  const branchCode = params.branch;

  const groups: Group[] = [
    {
      id: 'energy',
      label: 'Energy',
      count: params.energy?.length ?? 0,
      body: (
        <OptionList
          label="Energy"
          options={ENERGY_LEVELS}
          selected={params.energy}
          onToggle={(e) => update({ energy: toggleValue(params.energy, e, ENERGY_LEVELS) })}
          render={(e) => (
            <>
              <EnergySwatch energy={e} />
              {ENERGY_META[e].label}
            </>
          )}
          empty=""
        />
      ),
    },
    {
      id: 'key',
      label: 'Key',
      count: params.key?.length ?? 0,
      summary: single(params.key, (k) => k),
      body: (
        <OptionList
          label="Key"
          columns
          options={keys}
          selected={params.key}
          onToggle={(k) => update({ key: toggleValue(params.key, k, keys) })}
          render={(k) => k}
          empty="No keys yet"
        />
      ),
    },
    {
      id: 'decade',
      label: 'Decade',
      count: params.decade?.length ?? 0,
      summary: single(params.decade, decadeLabel),
      body: (
        <OptionList
          label="Decade"
          columns
          options={decades}
          selected={params.decade}
          onToggle={(d) => update({ decade: toggleValue(params.decade, d, decades) })}
          render={decadeLabel}
          empty="No decades yet"
        />
      ),
    },
    {
      id: 'branch',
      label: 'Branch use',
      count: branchCode ? 1 : 0,
      summary: branchCode,
      body: <BranchUseBody params={params} facets={facets} update={update} />,
    },
    ...CHORD_FILTERS.map((c) => {
      const options = withSelected(facets.chords[c.facet], params[c.param]);
      return {
        id: c.param,
        label: c.label,
        count: params[c.param]?.length ?? 0,
        summary: single(params[c.param], (v) => v),
        body: (
          <OptionList
            label={c.label}
            columns
            options={options}
            selected={params[c.param]}
            onToggle={(v) => update({ [c.param]: toggleValue(params[c.param], v, options) })}
            render={(v) => v}
            empty="No chords yet"
          />
        ),
      };
    }),
  ];
  return groups;
}

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground tabular-nums">
      {count}
    </span>
  );
}

function FilterDropdown({ group }: { group: Group }) {
  const active = group.count > 0;
  const shown = group.count === 1 && group.summary ? group.summary : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('h-10 gap-1.5', active && 'border-primary')}
          aria-label={active ? `${group.label}, ${group.count} selected` : group.label}
          data-filter={group.id}
        >
          {shown ? (
            <span>
              {group.label}: <span className="font-semibold">{shown}</span>
            </span>
          ) : (
            <>
              <span>{group.label}</span>
              <CountBadge count={group.count} />
            </>
          )}
          <ChevronDownIcon aria-hidden="true" className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={group.label}
        className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-72 max-w-[calc(100vw-2rem)] overflow-y-auto p-2"
      >
        {group.body}
      </PopoverContent>
    </Popover>
  );
}

function Chips({
  chips,
  onRemove,
  onClear,
}: {
  chips: ActiveFilterChip[];
  onRemove(chip: ActiveFilterChip): void;
  onClear(): void;
}) {
  if (chips.length === 0) return null;
  return (
    <ul aria-label="Active filters" className="flex min-w-0 flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <li key={chip.id} className="min-w-0">
          <span className="inline-flex max-w-full items-center gap-1.5 rounded-chip border bg-secondary py-0.5 pr-0.5 pl-2 text-sm text-secondary-foreground">
            {chip.energy && <EnergySwatch energy={chip.energy} />}
            <span className="truncate">{chip.label}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={chip.removeLabel}
              onClick={() => onRemove(chip)}
              className="-my-1.5 size-tap shrink-0"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </span>
        </li>
      ))}
      <li>
        <Button type="button" variant="link" size="sm" onClick={onClear} className="h-10">
          Clear filters
        </Button>
      </li>
    </ul>
  );
}

function LoadingRow() {
  return (
    <div aria-busy="true" aria-label="Loading filters" className="flex flex-wrap gap-2">
      {[20, 14, 18, 24].map((w) => (
        <Skeleton key={w} className="h-10" style={{ width: `${w * 0.25}rem` }} />
      ))}
    </div>
  );
}

/**
 * Concurrent multi-select filters (REQ-SRCH-03): Energy, Key, Decade, Branch use (branch then
 * levels) and first chord of chorus/refrain, verse and bridge. A row of dropdowns at >= 768px; a
 * single "Filters" button opening a bottom sheet below. Active values show as removable chips.
 */
export function FilterBar({
  params,
  facets,
  onChange,
  loading = false,
  error = null,
  className,
}: FilterBarProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY, false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const update = (patch: Partial<SearchParams>) =>
    onChange({ ...params, ...patch, page: undefined });
  const groups = buildGroups(params, facets, update);
  const chips = activeFilterChips(params, facets);
  const total = countActiveFilters(params);
  const clear = () => onChange(clearFilters(params));

  let controls: ReactNode;
  if (error) {
    controls = (
      <p role="alert" className="text-sm text-destructive">
        Filters couldn&rsquo;t load. {error}
      </p>
    );
  } else if (loading) {
    controls = <LoadingRow />;
  } else if (isDesktop) {
    controls = (
      <div role="toolbar" aria-label="Filters" className="flex flex-wrap items-center gap-2">
        {groups.map((g) => (
          <FilterDropdown key={g.id} group={g} />
        ))}
      </div>
    );
  } else {
    controls = (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-10 gap-2 self-start"
            aria-label={total > 0 ? `Filters, ${total} active` : 'Filters'}
          >
            <SlidersHorizontalIcon aria-hidden="true" />
            Filters
            <CountBadge count={total} />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          data-mode="sheet"
          className="max-h-[85dvh] gap-0 rounded-t-lg pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader className="pr-12">
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>Combine any filters. Results update as you choose.</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-2">
            {groups.map((g) => (
              <section
                key={g.id}
                className="flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0"
              >
                <h3 className="mb-1 text-sm font-semibold">{g.label}</h3>
                {g.body}
              </section>
            ))}
          </div>
          <SheetFooter className="flex-row justify-between border-t">
            <Button
              type="button"
              variant="ghost"
              className="h-10"
              disabled={total === 0}
              onClick={clear}
            >
              Clear filters
            </Button>
            <Button type="button" className="h-10" onClick={() => setSheetOpen(false)}>
              Show results
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className={cn('flex w-full min-w-0 flex-col gap-2', className)}
      data-mode={isDesktop ? 'bar' : 'sheet'}
    >
      {controls}
      <Chips chips={chips} onRemove={(chip) => update(chip.remove)} onClear={clear} />
    </div>
  );
}
