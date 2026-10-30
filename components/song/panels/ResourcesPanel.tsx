'use client';

import { useId, type ReactNode } from 'react';
import {
  CircleAlertIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileTextIcon,
  PlayIcon,
  ScrollTextIcon,
  type LucideIcon,
} from 'lucide-react';
import { displayKey, spokenKey } from '@/components/song/KeyBadge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RESOURCE_KINDS,
  type Resource,
  type ResourceFormat,
  type ResourceKind,
  type SongKey,
  type UUID,
} from '@/types/domain';

export interface ResourcesPanelProps {
  resources: Resource[];
  keys: SongKey[];
  onOpen(r: Resource): void;
  onShowLyrics(): void;
  /**
   * Whether the song has any lyrics. Hides the Lyrics group when false. Defaults to true.
   * (agent-spec/change-requests/UI-07-resources-panel-props.md)
   */
  hasLyrics?: boolean;
  /**
   * Rendered under the files, e.g. an "Add files" link. The caller passes it only for users who
   * may add files (contributors and up). (agent-spec/change-requests/UI-07-resources-panel-props.md)
   */
  addFilesSlot?: ReactNode;
}

export type ResourceGroupId = 'sheet_music' | 'audio' | 'projection';

export const RESOURCE_GROUP_LABEL: Record<ResourceGroupId, string> = {
  sheet_music: 'Sheet music',
  audio: 'Audio',
  projection: 'Projection',
};

export const RESOURCE_KIND_LABEL: Record<ResourceKind, string> = {
  full_score: 'Full score',
  lead_sheet: 'Lead sheet',
  chord_chart: 'Chord chart',
  audio: 'Audio',
  video_link: 'Video',
  instruction_link: 'Instructions',
  projection: 'Projection',
};

export const RESOURCE_FORMAT_LABEL: Record<ResourceFormat, string> = {
  pdf: 'PDF',
  mp3: 'MP3',
  m4a: 'M4A',
  pro: 'ProPresenter',
  mdb: 'MediaShout',
  ppt: 'PowerPoint',
  pptx: 'PowerPoint',
  url: 'Link',
};

/**
 * Which group a resource is listed under. Sheet music: score, lead sheet, chord chart.
 * Audio: recordings and video links. Instructions follow their format (a PDF reads like sheet
 * music, a recording or link is listened to).
 */
export function resourceGroup(r: Pick<Resource, 'kind' | 'format'>): ResourceGroupId {
  switch (r.kind) {
    case 'full_score':
    case 'lead_sheet':
    case 'chord_chart':
      return 'sheet_music';
    case 'audio':
    case 'video_link':
      return 'audio';
    case 'instruction_link':
      return r.format === 'pdf' ? 'sheet_music' : 'audio';
    case 'projection':
      return 'projection';
  }
}

/** What opening a resource does, so the row can say so before it's tapped (REQ-ROW-04). */
export type ResourceAction = 'view' | 'play' | 'link' | 'download' | 'unavailable';

export function resourceAction(
  r: Pick<Resource, 'format' | 'url' | 'storagePath'>,
): ResourceAction {
  if (r.format === 'url') return r.url ? 'link' : 'unavailable';
  if (!r.storagePath && !r.url) return 'unavailable';
  if (r.format === 'pdf') return 'view';
  if (r.format === 'mp3' || r.format === 'm4a') return 'play';
  return 'download';
}

const ACTION_META: Record<ResourceAction, { icon: LucideIcon; hint: string }> = {
  view: { icon: FileTextIcon, hint: 'opens viewer' },
  play: { icon: PlayIcon, hint: 'plays here' },
  link: { icon: ExternalLinkIcon, hint: 'opens in a new tab' },
  download: { icon: DownloadIcon, hint: 'downloads' },
  unavailable: { icon: CircleAlertIcon, hint: 'file unavailable' },
};

/**
 * Secondary text for a resource row, e.g. "Chord chart · PDF". Leaves out the kind when the label
 * is just the kind, and the format when the label already names it.
 */
export function resourceDetail(r: Pick<Resource, 'kind' | 'format' | 'label'>): string {
  const label = r.label.trim().toLowerCase();
  const kind = RESOURCE_KIND_LABEL[r.kind];
  const format = RESOURCE_FORMAT_LABEL[r.format];
  const parts = [
    label === kind.toLowerCase() ? null : kind,
    label.includes(format.toLowerCase()) ? null : format,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : format;
}

export interface KeyedResources {
  /** null: no key, or a key that isn't in `keys` ("Any key"). */
  key: SongKey | null;
  resources: Resource[];
}

export interface ResourceGroup {
  id: ResourceGroupId;
  /** Sheet music and audio are split by key; projection is one key-less bucket. */
  byKey: KeyedResources[];
}

const kindOrder = (k: ResourceKind) => RESOURCE_KINDS.indexOf(k);

function sortResources(rs: Resource[]): Resource[] {
  return [...rs].sort(
    (a, b) => kindOrder(a.kind) - kindOrder(b.kind) || a.label.localeCompare(b.label),
  );
}

/**
 * Groups resources as Sheet music / Audio (each by key, in `keys` order, then "Any key") /
 * Projection. Empty groups and empty key buckets are left out.
 */
export function groupResources(resources: Resource[], keys: SongKey[]): ResourceGroup[] {
  const knownKeys = new Set<UUID>(keys.map((k) => k.id));
  const groups: ResourceGroup[] = [];

  for (const id of ['sheet_music', 'audio'] as const) {
    const inGroup = resources.filter((r) => resourceGroup(r) === id);
    if (inGroup.length === 0) continue;
    const byKey: KeyedResources[] = keys
      .map((key) => ({
        key,
        resources: sortResources(inGroup.filter((r) => r.songKeyId === key.id)),
      }))
      .filter((b) => b.resources.length > 0);
    const anyKey = inGroup.filter((r) => r.songKeyId === null || !knownKeys.has(r.songKeyId));
    if (anyKey.length > 0) byKey.push({ key: null, resources: sortResources(anyKey) });
    groups.push({ id, byKey });
  }

  const projection = resources.filter((r) => resourceGroup(r) === 'projection');
  if (projection.length > 0) {
    groups.push({ id: 'projection', byKey: [{ key: null, resources: sortResources(projection) }] });
  }
  return groups;
}

const itemClass =
  'flex min-h-tap w-full items-center gap-3 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent';

function GroupHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
    >
      {children}
    </h3>
  );
}

function ResourceItem({ resource, onOpen }: { resource: Resource; onOpen(r: Resource): void }) {
  const action = resourceAction(resource);
  const { icon: Icon, hint } = ACTION_META[action];
  const detail = resourceDetail(resource);
  return (
    <li>
      <button
        type="button"
        className={itemClass}
        disabled={action === 'unavailable'}
        aria-label={`${resource.label}, ${detail}, ${hint}`}
        data-action={action}
        onClick={() => onOpen(resource)}
      >
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{resource.label}</span>
          <span className="truncate text-xs text-muted-foreground">
            {action === 'unavailable' ? 'File unavailable' : detail}
          </span>
        </span>
      </button>
    </li>
  );
}

function keyHeading(key: SongKey | null): { text: string; spoken: string } {
  if (key === null) return { text: 'Any key', spoken: 'Any key' };
  const usual = key.isPrimary ? ' (usual)' : '';
  return {
    text: `Key ${displayKey(key.key)}${usual}`,
    spoken: `Key ${spokenKey(key.key)}${usual}`,
  };
}

/**
 * Song files grouped Lyrics / Sheet music (by key) / Audio (by key) / Projection (REQ-ROW-02).
 * Props only; the caller decides what opening a resource does (viewer, inline audio, new tab or
 * download, REQ-ROW-04). Meant to sit inside `ResponsivePanel`.
 */
export function ResourcesPanel({
  resources,
  keys,
  onOpen,
  onShowLyrics,
  hasLyrics = true,
  addFilesSlot,
}: ResourcesPanelProps) {
  const groups = groupResources(resources, keys);
  const idBase = useId();
  const showKeyHeadings = (g: ResourceGroup) => g.id !== 'projection';

  return (
    <div className="flex flex-col gap-4" data-testid="resources-panel">
      {hasLyrics ? (
        <section aria-labelledby={`${idBase}-lyrics`} className="flex flex-col gap-1">
          <GroupHeading id={`${idBase}-lyrics`}>Lyrics</GroupHeading>
          <button type="button" className={itemClass} onClick={onShowLyrics}>
            <ScrollTextIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-medium">Show lyrics</span>
          </button>
        </section>
      ) : null}

      {groups.map((group) => {
        const headingId = `${idBase}-${group.id}`;
        return (
          <section key={group.id} aria-labelledby={headingId} className="flex flex-col gap-1">
            <GroupHeading id={headingId}>{RESOURCE_GROUP_LABEL[group.id]}</GroupHeading>
            {group.byKey.map((bucket) => {
              const heading = keyHeading(bucket.key);
              const list = (
                <ul className="flex flex-col">
                  {bucket.resources.map((r) => (
                    <ResourceItem key={r.id} resource={r} onOpen={onOpen} />
                  ))}
                </ul>
              );
              if (!showKeyHeadings(group)) return <div key="all">{list}</div>;
              return (
                <div
                  key={bucket.key?.id ?? 'any'}
                  role="group"
                  aria-label={`${RESOURCE_GROUP_LABEL[group.id]}, ${heading.spoken}`}
                  className="flex flex-col"
                >
                  <p aria-hidden className="px-2 pt-1 text-xs font-medium">
                    {heading.text}
                  </p>
                  {list}
                </div>
              );
            })}
          </section>
        );
      })}

      {resources.length === 0 ? (
        <p className="px-2 text-sm text-muted-foreground">No files yet</p>
      ) : null}

      {addFilesSlot ? <div className="px-2 text-sm">{addFilesSlot}</div> : null}
    </div>
  );
}

/** Loading state while a song's files are fetched. */
export function ResourcesPanelSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading files">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2 px-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-3/4" />
        </div>
      ))}
    </div>
  );
}
