'use client';

import { LockIcon, SparklesIcon, Undo2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import { BranchCode } from '@/components/song/BranchCode';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/components/ui/utils';
import { can } from '@/lib/permissions';
import {
  USAGE_LEVELS,
  type AppUser,
  type Branch,
  type BranchUsage,
  type SongDetail,
  type UsageLevel,
  type UUID,
} from '@/types/domain';
import { errorsFor } from './BasicInfoSection';
import type { SongFormErrors, SongFormSectionProps, SongFormValue } from './types';

export type UsageValue = SongFormValue['usage'];
export type UsageEntry = UsageValue[number];

export interface UsageSectionProps extends SongFormSectionProps {
  /** Every branch, in display order (one row each). */
  branches: Branch[];
  /** The signed-in user; decides whether rows are editable (`usage:write`). */
  user: AppUser | null;
  /**
   * The song's stored usage (`SongDetail.usage`), used to show derived values (REQ-BR-02) for
   * branches with no manual entry in `value.usage`. Omit for a new song.
   */
  saved?: BranchUsage[];
  disabled?: boolean;
}

export const USAGE_LABEL: Record<UsageLevel, string> = {
  high: 'High',
  low: 'Low',
  rare: 'Rare',
  none: 'None',
};

export const DERIVED_HINT =
  'Set automatically from how often setlists used this song in the last year. Choose a level to override it.';

const DERIVED_NOTE =
  'Derived values are set automatically from setlist history over the last year. Choosing a level overrides one; clearing it brings the derived value back.';

// ---------- Pure helpers (exported for tests and the form page) ----------

/**
 * The usage slice of an existing song (edit form): manual rows only. Derived rows stay out of the
 * form value so saving doesn't turn them into manual ones; pass `song.usage` as `saved` instead.
 */
export function usageFromSong(song: Pick<SongDetail, 'usage'>): UsageValue {
  return song.usage
    .filter((u) => u.source === 'manual')
    .map((u) => ({ branchId: u.branchId, level: u.level }));
}

/** Sets (or replaces) the manual level for one branch, keeping the other entries in order. */
export function setBranchLevel(usage: UsageValue, branchId: UUID, level: UsageLevel): UsageValue {
  const index = usage.findIndex((u) => u.branchId === branchId);
  if (index === -1) return [...usage, { branchId, level }];
  return usage.map((u, i) => (i === index ? { branchId, level } : u));
}

/** Removes the manual entry for one branch (it falls back to its derived value, or none). */
export function clearBranchLevel(usage: UsageValue, branchId: UUID): UsageValue {
  return usage.filter((u) => u.branchId !== branchId);
}

export type ResolvedUsage =
  | { source: 'manual'; level: UsageLevel; derivedLevel: UsageLevel | null }
  | { source: 'derived'; level: UsageLevel; derivedLevel: UsageLevel }
  | { source: 'unset'; level: 'none'; derivedLevel: null };

/**
 * What a branch row shows: the manual entry if there is one (manual overrides derived, SPEC §6),
 * else the stored derived value, else `none` (missing rows mean none).
 */
export function resolveBranchUsage(
  branchId: UUID,
  usage: UsageValue,
  saved: readonly BranchUsage[] = [],
): ResolvedUsage {
  const stored = saved.find((u) => u.branchId === branchId);
  const derivedLevel = stored?.source === 'derived' ? stored.level : null;
  const entry = usage.find((u) => u.branchId === branchId);
  if (entry) return { source: 'manual', level: entry.level, derivedLevel };
  if (derivedLevel !== null) return { source: 'derived', level: derivedLevel, derivedLevel };
  return { source: 'unset', level: 'none', derivedLevel: null };
}

export type UsageEditability = { editable: true } | { editable: false; reason: string };

/**
 * Whether `user` may change branch usage. permissions.md grants `usage:write` to contributor and
 * up for every branch (there is no per-branch rule), so every row shares one answer.
 */
export function usageEditability(user: AppUser | null): UsageEditability {
  if (can(user, 'usage:write')) return { editable: true };
  if (user === null) return { editable: false, reason: 'Sign in to change branch usage.' };
  if (user.disabledAt !== null) {
    return { editable: false, reason: 'Your account is disabled, so you can’t change usage.' };
  }
  return {
    editable: false,
    reason: 'Only contributors, music leaders and admins can change branch usage.',
  };
}

/**
 * Field errors for one row. Server paths index into `value.usage` (`usage.2.level`, or `2.level`
 * straight from `setBranchUsage`), so they are mapped back to that entry's branch.
 */
export function rowErrors(
  errors: SongFormErrors | undefined,
  usage: UsageValue,
  branchId: UUID,
): string[] {
  if (!errors) return [];
  return Object.entries(errors)
    .filter(([key]) => {
      const match = /^(?:usage\.)?(\d+)(?:\.|$)/.exec(key);
      return match !== null && usage[Number(match[1])]?.branchId === branchId;
    })
    .flatMap(([, messages]) => messages);
}

// ---------- Small pieces ----------

function FieldErrors({ id, messages }: { id: string; messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul id={id} className="space-y-0.5 text-sm text-destructive">
      {messages.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}

function DerivedBadge() {
  return (
    <Badge variant="outline" className="border-dashed" title={DERIVED_HINT}>
      <SparklesIcon aria-hidden />
      Derived
    </Badge>
  );
}

function UsageRow({
  branch,
  resolved,
  editability,
  isOwnBranch,
  messages,
  hintId,
  reasonId,
  onSet,
  onClear,
}: {
  branch: Branch;
  resolved: ResolvedUsage;
  editability: UsageEditability;
  isOwnBranch: boolean;
  messages: string[];
  hintId: string;
  reasonId: string;
  onSet(level: UsageLevel): void;
  onClear(): void;
}) {
  const id = useId();
  const nameId = `${id}-name`;
  const statusId = `${id}-status`;
  const errorsId = `${id}-errors`;
  const readOnly = !editability.editable;
  const describedBy = [
    statusId,
    readOnly ? reasonId : null,
    resolved.source === 'derived' ? hintId : null,
    messages.length > 0 ? errorsId : null,
  ]
    .filter(Boolean)
    .join(' ');

  let status: string;
  if (resolved.source === 'derived') status = `Derived: ${USAGE_LABEL[resolved.level]}`;
  else if (resolved.source === 'manual' && resolved.derivedLevel !== null)
    status = `Set manually; overrides derived ${USAGE_LABEL[resolved.derivedLevel]}`;
  else if (resolved.source === 'manual') status = 'Set manually';
  else status = 'Not set';

  return (
    <li
      data-branch-id={branch.id}
      data-source={resolved.source}
      className={cn(
        'grid gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center',
        messages.length > 0 && 'border-destructive',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <BranchCode code={branch.code} />
        <span id={nameId} className="font-medium break-words">
          {branch.name}
        </span>
        {isOwnBranch && <span className="text-xs text-muted-foreground">(your branch)</span>}
        {resolved.source === 'derived' && <DerivedBadge />}
        {readOnly && <LockIcon aria-hidden className="size-3.5 text-muted-foreground" />}
        <span id={statusId} className="basis-full text-xs text-muted-foreground">
          {status}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-1">
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby={nameId}
          aria-describedby={describedBy}
          aria-invalid={messages.length > 0 || undefined}
          disabled={readOnly}
          value={resolved.level}
          onValueChange={(v) => {
            // Re-choosing the shown level pins a derived or unset row as manual; manual stays put.
            const level = (v || resolved.level) as UsageLevel;
            if (v === '' && resolved.source === 'manual') return;
            onSet(level);
          }}
          className="grid w-full min-w-0 grid-cols-4 sm:flex sm:w-auto"
        >
          {USAGE_LEVELS.map((level) => (
            <ToggleGroupItem
              key={level}
              value={level}
              className={cn(
                'h-tap min-w-0 px-2 sm:min-w-14',
                // Derived selections look provisional (muted, italic, dashed underline) so they
                // never read as a value someone set; the "Derived" badge and status say it too.
                resolved.source === 'derived'
                  ? 'data-[state=on]:bg-secondary data-[state=on]:font-semibold data-[state=on]:text-foreground data-[state=on]:italic data-[state=on]:underline data-[state=on]:decoration-dashed data-[state=on]:underline-offset-4 data-[state=on]:hover:bg-secondary data-[state=on]:hover:text-foreground'
                  : 'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground',
              )}
            >
              {USAGE_LABEL[level]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {!readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className={cn('size-tap shrink-0', resolved.source !== 'manual' && 'invisible')}
            aria-label={
              resolved.derivedLevel !== null
                ? `Clear ${branch.name} usage (back to derived ${USAGE_LABEL[resolved.derivedLevel]})`
                : `Clear ${branch.name} usage`
            }
            title="Clear"
            disabled={resolved.source !== 'manual'}
            aria-hidden={resolved.source === 'manual' ? undefined : true}
            onClick={onClear}
          >
            <Undo2Icon aria-hidden />
          </Button>
        )}
      </div>
      <div className="sm:col-span-2">
        <FieldErrors id={errorsId} messages={messages} />
      </div>
    </li>
  );
}

// ---------- Section ----------

/** Song form section for REQ-LIB-05: one row per branch with a high/low/rare/none control. */
export function UsageSection({
  value,
  onChange,
  errors,
  branches,
  user,
  saved,
  disabled,
}: UsageSectionProps) {
  const id = useId();
  const usage = value.usage ?? [];
  const [announcement, setAnnouncement] = useState('');
  const sectionErrors = Object.entries(errors ?? {})
    .filter(([key]) => key === 'usage' || key === '')
    .flatMap(([, m]) => m);
  // Row errors whose index no longer matches an entry still need to be seen.
  const strayErrors = errorsFor(errors, 'usage').filter(
    (m) =>
      !sectionErrors.includes(m) &&
      !branches.some((b) => rowErrors(errors, usage, b.id).includes(m)),
  );
  const editability = usageEditability(user);
  const hasDerived = branches.some(
    (b) => resolveBranchUsage(b.id, usage, saved).derivedLevel !== null,
  );
  const hintId = `${id}-derived-hint`;
  const reasonId = `${id}-readonly`;
  const errorsId = `${id}-errors`;
  const messages = [...sectionErrors, ...strayErrors];

  return (
    <fieldset
      className="min-w-0 space-y-3"
      disabled={disabled}
      aria-describedby={messages.length > 0 ? errorsId : undefined}
    >
      <legend className="mb-3 text-lg font-semibold">Branch usage</legend>
      <p className="text-sm text-muted-foreground">
        How often each branch uses this song. Values you set here override derived ones.
      </p>
      {hasDerived && (
        <p id={hintId} className="flex gap-1.5 text-xs text-muted-foreground">
          <SparklesIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{DERIVED_NOTE}</span>
        </p>
      )}
      {!editability.editable && branches.length > 0 && (
        <p
          id={reasonId}
          className="flex gap-1.5 rounded-md bg-muted p-2 text-sm text-muted-foreground"
        >
          <LockIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{editability.reason}</span>
        </p>
      )}
      <FieldErrors id={errorsId} messages={messages} />

      {branches.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No branches yet. An admin can add them under Admin, Branches.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Usage by branch">
          {branches.map((branch) => {
            const resolved = resolveBranchUsage(branch.id, usage, saved);
            return (
              <UsageRow
                key={branch.id}
                branch={branch}
                resolved={resolved}
                editability={editability}
                isOwnBranch={user?.branchId === branch.id}
                messages={rowErrors(errors, usage, branch.id)}
                hintId={hintId}
                reasonId={reasonId}
                onSet={(level) => {
                  onChange({ usage: setBranchLevel(usage, branch.id, level) });
                  setAnnouncement(`${branch.name} usage set to ${USAGE_LABEL[level]}`);
                }}
                onClear={() => {
                  onChange({ usage: clearBranchLevel(usage, branch.id) });
                  setAnnouncement(
                    resolved.derivedLevel !== null
                      ? `${branch.name} usage back to derived ${USAGE_LABEL[resolved.derivedLevel]}`
                      : `${branch.name} usage cleared`,
                  );
                }}
              />
            );
          })}
        </ul>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </fieldset>
  );
}

/** Loading placeholder while the song or branches are fetched. */
export function UsageSectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading branch usage">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-4 w-3/4" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full sm:h-16" />
      ))}
    </div>
  );
}
