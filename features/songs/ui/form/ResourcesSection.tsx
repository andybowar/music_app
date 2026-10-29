'use client';

import {
  ExternalLinkIcon,
  FileIcon,
  LinkIcon,
  PencilIcon,
  RotateCwIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { InlineAudio } from '@/components/media/InlineAudio';
import { PdfViewer } from '@/components/media/PdfViewer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/utils';
import {
  KEYED_KINDS,
  KIND_FORMATS,
  MAX_UPLOAD_BYTES,
  RESOURCE_KINDS,
  type ActionResult,
  type ISODateTime,
  type Resource,
  type ResourceFormat,
  type ResourceKind,
  type UUID,
} from '@/types/domain';
import {
  resourceLinkInputSchema,
  type ResourceLinkInput,
  type UploadRequest,
} from '@/types/validation';
import { errorsFor } from './BasicInfoSection';
import type { SongFormErrors, SongFormSectionProps } from './types';

export type UploadTicket = { resourceId: UUID; uploadUrl: string; path: string };
/** Sends the file to a signed upload URL, reporting progress as a 0–1 fraction. */
export type PutFile = (url: string, file: File, onProgress: (f: number) => void) => Promise<void>;

export interface ResourcesSectionProps extends SongFormSectionProps {
  /** null on /songs/new: files can only be attached once the song is saved. */
  songId: UUID | null;
  /** The song's resources when the form loads; the section keeps its own copy afterwards. */
  initialResources: Resource[];
  /** Called with the full list after each successful upload, link save or delete. */
  onResourcesChange?(resources: Resource[]): void;
  /** api.md LIB-06 / LIB-07 actions. */
  requestUpload(req: UploadRequest): Promise<ActionResult<UploadTicket>>;
  finalizeUpload(resourceId: UUID): Promise<ActionResult<Resource>>;
  deleteResource(id: UUID): Promise<ActionResult<void>>;
  getSignedResourceUrl(id: UUID): Promise<ActionResult<{ url: string; expiresAt: ISODateTime }>>;
  addLink(input: ResourceLinkInput): Promise<ActionResult<Resource>>;
  updateLink(id: UUID, input: ResourceLinkInput): Promise<ActionResult<Resource>>;
  /** Defaults to an XHR PUT (for upload progress). */
  putFile?: PutFile;
  disabled?: boolean;
}

// ---------- Pure helpers (exported for tests) ----------

export const KIND_LABEL: Record<ResourceKind, string> = {
  full_score: 'Full score',
  lead_sheet: 'Lead sheet',
  chord_chart: 'Chord chart',
  audio: 'Audio',
  video_link: 'Video',
  instruction_link: 'Instruction',
  projection: 'Projection',
};

const FILE_FORMATS = new Set<ResourceFormat>(['pdf', 'mp3', 'm4a', 'pro', 'mdb', 'ppt', 'pptx']);
const AUDIO_FORMATS = new Set<ResourceFormat>(['mp3', 'm4a']);

/** Kinds a block offers: per-key blocks get keyed kinds, the projection block only 'projection'. */
export function kindsFor(keyed: boolean, as: 'file' | 'link'): ResourceKind[] {
  return RESOURCE_KINDS.filter(
    (k) =>
      KEYED_KINDS.includes(k) === keyed &&
      KIND_FORMATS[k].some((f) => (as === 'link' ? f === 'url' : f !== 'url')),
  );
}

export function formatFromFileName(name: string): ResourceFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() as ResourceFormat | undefined;
  return ext && FILE_FORMATS.has(ext) ? ext : null;
}

const formatList = (kind: ResourceKind) =>
  KIND_FORMATS[kind]
    .filter((f) => f !== 'url')
    .map((f) => `.${f}`)
    .join(', ');

/** Why a file can't be uploaded as `kind` (KIND_FORMATS, MAX_UPLOAD_BYTES, schema key check), or null. */
export function checkFile(
  kind: ResourceKind,
  keyed: boolean,
  file: { name: string; size: number },
): string | null {
  if (KEYED_KINDS.includes(kind) !== keyed) {
    return keyed ? 'Projection files go in the Projection block' : 'Pick a key for this file';
  }
  const format = formatFromFileName(file.name);
  if (!format || !KIND_FORMATS[kind].includes(format)) {
    return `${file.name}: ${KIND_LABEL[kind]} must be ${formatList(kind)}`;
  }
  if (file.size === 0) return `${file.name} is empty`;
  if (file.size > MAX_UPLOAD_BYTES) {
    return `${file.name} is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`;
  }
  return null;
}

/** "Chord chart", then "Chord chart 2", … — the first label not already used. */
export function nextLabel(taken: readonly string[], base: string): string {
  const used = new Set(taken.map((l) => l.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let n = 2;
  while (used.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

/**
 * YouTube video id from watch, youtu.be, shorts, embed and live URLs, else null.
 * Stand-in for `parseYouTubeId` in lib/youtube.ts (LIB-07, not merged yet); same contract.
 */
export function parseYouTubeId(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, '');
  const path = url.pathname.split('/').filter(Boolean);
  let id: string | null | undefined = null;
  if (host === 'youtu.be') id = path[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (path[0] === 'watch') id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(path[0] ?? '')) id = path[1];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

export type LinkDraft = { kind: ResourceKind; label: string; url: string };

/** Validates a link draft with `resourceLinkInputSchema`; a blank label falls back to the site. */
export function buildLinkInput(
  songId: UUID,
  songKeyId: UUID | null,
  draft: LinkDraft,
): { ok: true; input: ResourceLinkInput } | { ok: false; fieldErrors: SongFormErrors } {
  const url = draft.url.trim();
  let label = draft.label.trim();
  if (!label && url) {
    try {
      label = parseYouTubeId(url) ? 'YouTube' : new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // Invalid URL; the schema reports it.
    }
  }
  const parsed = resourceLinkInputSchema.safeParse({
    songId,
    songKeyId,
    kind: draft.kind,
    label,
    url,
  });
  if (parsed.success) return { ok: true, input: parsed.data };
  const fieldErrors: SongFormErrors = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? 'kind');
    const message =
      field === 'url'
        ? 'Enter a full web address starting with https://'
        : field === 'label'
          ? 'Labels are up to 120 characters'
          : issue.message;
    fieldErrors[field] = [...(fieldErrors[field] ?? []), message];
  }
  return { ok: false, fieldErrors };
}

export const defaultPutFile: PutFile = (url, file, onProgress) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Network error'));
    xhr.send(file);
  });

// ---------- State ----------

type Job = {
  localId: string;
  songKeyId: UUID | null;
  kind: ResourceKind;
  format: ResourceFormat;
  label: string;
  file: File;
  progress: number;
  stage: 'uploading' | 'finalizing' | 'failed';
  error?: string;
  /** Set once the bytes are in storage, so a retry only re-finalizes. */
  uploaded?: UploadTicket;
};

/** One key's block or the projection block. */
type Block = { songKeyId: UUID | null; keyed: boolean; title: string; note?: string };

const labelClass = 'text-sm font-medium';
const selectClass =
  'h-tap w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30';

function Messages({ id, messages }: { id: string; messages: string[] }) {
  if (messages.length === 0) return null;
  return (
    <ul id={id} className="space-y-0.5 text-sm text-destructive">
      {messages.map((m) => (
        <li key={m}>{m}</li>
      ))}
    </ul>
  );
}

function KindSelect({
  id,
  kinds,
  value,
  onChange,
}: {
  id: string;
  kinds: ResourceKind[];
  value: ResourceKind;
  onChange(k: ResourceKind): void;
}) {
  return (
    <select
      id={id}
      className={selectClass}
      value={value}
      onChange={(e) => onChange(e.target.value as ResourceKind)}
    >
      {kinds.map((k) => (
        <option key={k} value={k}>
          {KIND_LABEL[k]}
        </option>
      ))}
    </select>
  );
}

// ---------- Link form (add and edit) ----------

function LinkForm({
  songId,
  block,
  initial,
  onSubmit,
  onCancel,
}: {
  songId: UUID;
  block: Block;
  initial?: Resource;
  onSubmit(input: ResourceLinkInput): Promise<ActionResult<Resource>>;
  onCancel?(): void;
}) {
  const id = useId();
  const kinds = kindsFor(block.keyed, 'link');
  const defaultKind = kinds.includes('video_link') ? 'video_link' : kinds[0]!;
  const blank = (): LinkDraft => ({ kind: defaultKind, label: '', url: '' });
  const urlRef = useRef<HTMLInputElement>(null);
  // Editing replaces the row with this form; move focus into it.
  useEffect(() => {
    if (initial) urlRef.current?.focus();
  }, [initial]);
  const [draft, setDraft] = useState<LinkDraft>(
    initial ? { kind: initial.kind, label: initial.label, url: initial.url ?? '' } : blank,
  );
  const [errors, setErrors] = useState<SongFormErrors>({});
  const [saving, setSaving] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const youTubeId = parseYouTubeId(draft.url);

  const set = (patch: Partial<LinkDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
  };

  const submit = async () => {
    const built = buildLinkInput(songId, block.songKeyId, draft);
    if (!built.ok) return setErrors(built.fieldErrors);
    setSaving(true);
    try {
      const result = await onSubmit(built.input);
      if (result.ok) {
        if (!initial) setDraft(blank());
        onCancel?.();
      } else {
        setErrors(result.error.fieldErrors ?? { form: [result.error.message] });
      }
    } catch {
      setErrors({ form: ["Couldn't save the link. Try again."] });
    } finally {
      setSaving(false);
    }
  };

  const err = (f: string) => errorsFor(errors, f);
  const field = (name: string, label: string, input: ReactNode) => (
    <div className="space-y-1">
      <label htmlFor={`${id}-${name}`} className={labelClass}>
        {label}
      </label>
      {input}
      <Messages id={`${id}-${name}-errors`} messages={err(name)} />
    </div>
  );
  const aria = (name: string) => ({
    'aria-invalid': err(name).length > 0 || undefined,
    'aria-describedby': err(name).length > 0 ? `${id}-${name}-errors` : undefined,
  });

  return (
    <div
      role="group"
      aria-label={initial ? `Edit link ${initial.label}` : `Add link to ${block.title}`}
      className="space-y-3 rounded-md border border-dashed p-3"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
          e.preventDefault();
          void submit();
        } else if (e.key === 'Escape' && onCancel) onCancel();
      }}
    >
      {field(
        'url',
        'Link URL',
        <Input
          ref={urlRef}
          id={`${id}-url`}
          className="h-tap"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={draft.url}
          onChange={(e) => {
            setThumbFailed(false);
            set({ url: e.target.value });
          }}
          {...aria('url')}
        />,
      )}
      {youTubeId && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {!thumbFailed && (
            // reason: external thumbnail, next/image would need a remote-host config.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://i.ytimg.com/vi/${youTubeId}/mqdefault.jpg`}
              alt="YouTube thumbnail"
              className="h-14 w-24 shrink-0 rounded bg-muted object-cover"
              onError={() => setThumbFailed(true)}
            />
          )}
          <span>YouTube video detected</span>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {field(
          'label',
          'Label (optional)',
          <Input
            id={`${id}-label`}
            className="h-tap"
            maxLength={120}
            placeholder={youTubeId ? 'YouTube' : 'e.g. Hillsong live'}
            value={draft.label}
            onChange={(e) => set({ label: e.target.value })}
            {...aria('label')}
          />,
        )}
        {kinds.length > 1 &&
          field(
            'kind',
            'Type',
            <KindSelect
              id={`${id}-kind`}
              kinds={kinds}
              value={draft.kind}
              onChange={(kind) => set({ kind })}
            />,
          )}
      </div>
      <Messages id={`${id}-form-errors`} messages={err('form').concat(err('songKeyId'))} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="h-tap" disabled={saving} onClick={() => void submit()}>
          <LinkIcon aria-hidden />
          {saving ? 'Saving…' : initial ? 'Save link' : 'Add link'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" className="h-tap" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- Dropzone ----------

function UploadZone({
  block,
  takenLabels,
  onFiles,
}: {
  block: Block;
  takenLabels: string[];
  onFiles(files: Array<{ file: File; kind: ResourceKind; label: string }>): void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const kinds = kindsFor(block.keyed, 'file');
  const [kind, setKind] = useState<ResourceKind>(
    kinds.includes('chord_chart') ? 'chord_chart' : kinds[0]!,
  );
  const [label, setLabel] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    const files = [...(list ?? [])];
    const problems = files.map((f) => checkFile(kind, block.keyed, f)).filter((p) => p !== null);
    setErrors(problems);
    const taken = [...takenLabels];
    const accepted = files
      .filter((f) => !checkFile(kind, block.keyed, f))
      .map((file) => {
        const l = nextLabel(taken, label.trim() || KIND_LABEL[kind]);
        taken.push(l);
        return { file, kind, label: l };
      });
    if (accepted.length > 0) {
      onFiles(accepted);
      setLabel('');
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files);
  };

  return (
    <div
      className={cn(
        'space-y-3 rounded-md border border-dashed p-3',
        over && 'border-ring bg-accent ring-2 ring-ring/50',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      data-testid="dropzone"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {kinds.length > 1 && (
          <div className="space-y-1">
            <label htmlFor={`${id}-kind`} className={labelClass}>
              File type
            </label>
            <KindSelect id={`${id}-kind`} kinds={kinds} value={kind} onChange={setKind} />
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor={`${id}-label`} className={labelClass}>
            File label (optional)
          </label>
          <Input
            id={`${id}-label`}
            className="h-tap"
            maxLength={120}
            placeholder={nextLabel(takenLabels, KIND_LABEL[kind])}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Button
          type="button"
          variant="outline"
          className="h-tap"
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon aria-hidden />
          Choose file
        </Button>
        <span>or drop files here · {formatList(kind)}, up to 50 MB</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        aria-label={`Upload ${KIND_LABEL[kind]} to ${block.title}`}
        accept={formatList(kind)}
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
      <Messages id={`${id}-errors`} messages={errors} />
    </div>
  );
}

// ---------- Rows ----------

function JobRow({ job, onRetry, onDismiss }: { job: Job; onRetry(): void; onDismiss(): void }) {
  const pct = Math.round(job.progress * 100);
  return (
    <li className="space-y-1 rounded-md border bg-card p-2 text-sm">
      <div className="flex items-center gap-2">
        <FileIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 break-words">
          {job.label} <span className="text-muted-foreground">· {job.file.name}</span>
        </span>
        {job.stage === 'failed' && (
          <>
            <Button type="button" variant="outline" size="sm" className="h-tap" onClick={onRetry}>
              <RotateCwIcon aria-hidden />
              Retry
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={`Dismiss ${job.label}`}
              onClick={onDismiss}
            >
              <XIcon aria-hidden />
            </Button>
          </>
        )}
      </div>
      {job.stage === 'failed' ? (
        <p className="text-destructive" role="alert">
          {job.error}
        </p>
      ) : (
        <div
          role="progressbar"
          aria-label={`Uploading ${job.label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={job.stage === 'finalizing' ? 'Finishing' : `${pct}%`}
          className="h-1.5 overflow-hidden rounded bg-muted"
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
    </li>
  );
}

function ResourceRow({
  resource,
  onOpen,
  onEdit,
  onRemove,
  audioUrl,
}: {
  resource: Resource;
  onOpen?(): void;
  onEdit?(): void;
  onRemove(): Promise<void>;
  audioUrl?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const isLink = resource.format === 'url';
  const name = resource.label;
  return (
    <li className="space-y-2 rounded-md border bg-card p-2 text-sm">
      <div className="flex flex-wrap items-center gap-1">
        {isLink ? (
          <LinkIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <FileIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 px-1 break-words">
          {name}{' '}
          <span className="text-xs text-muted-foreground">
            ({KIND_LABEL[resource.kind]} · {isLink ? 'link' : resource.format.toUpperCase()})
          </span>
        </span>
        {confirming ? (
          <>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-tap"
              disabled={removing}
              onClick={async () => {
                setRemoving(true);
                await onRemove();
                setRemoving(false);
                setConfirming(false);
              }}
            >
              {removing ? 'Removing…' : `Remove ${name}`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-tap"
              onClick={() => setConfirming(false)}
            >
              Keep
            </Button>
          </>
        ) : (
          <>
            {isLink ? (
              <Button asChild variant="ghost" size="icon-lg">
                <a
                  href={resource.url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${name}`}
                >
                  <ExternalLinkIcon aria-hidden />
                </a>
              </Button>
            ) : (
              onOpen && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Open ${name}`}
                  onClick={onOpen}
                >
                  <ExternalLinkIcon aria-hidden />
                </Button>
              )
            )}
            {onEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={`Edit ${name}`}
                onClick={onEdit}
              >
                <PencilIcon aria-hidden />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label={`Delete ${name}`}
              onClick={() => setConfirming(true)}
            >
              <TrashIcon aria-hidden />
            </Button>
          </>
        )}
      </div>
      {audioUrl && <InlineAudio url={audioUrl} title={name} />}
    </li>
  );
}

// ---------- Section ----------

const KIND_ORDER = new Map(RESOURCE_KINDS.map((k, i) => [k, i]));
const byKind = (a: Resource, b: Resource) =>
  KIND_ORDER.get(a.kind)! - KIND_ORDER.get(b.kind)! || a.createdAt.localeCompare(b.createdAt);

/** Song form section for REQ-LIB-09/10: files and links per key, plus key-independent projection. */
export function ResourcesSection({
  value,
  errors,
  songId,
  initialResources,
  onResourcesChange,
  requestUpload,
  finalizeUpload,
  deleteResource,
  getSignedResourceUrl,
  addLink,
  updateLink,
  putFile = defaultPutFile,
  disabled,
}: ResourcesSectionProps) {
  const [items, setItems] = useState<Resource[]>(initialResources);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [editing, setEditing] = useState<UUID | null>(null);
  const [viewer, setViewer] = useState<{ url: string; title: string } | null>(null);
  const [audio, setAudio] = useState<Record<UUID, string>>({});
  const [announcement, setAnnouncement] = useState('');
  const jobSeq = useRef(0);
  const notify = useRef(onResourcesChange);
  notify.current = onResourcesChange;
  const reported = useRef(items);

  useEffect(() => {
    if (reported.current === items) return;
    reported.current = items;
    notify.current?.(items);
  }, [items]);

  const sectionErrors = errorsFor(errors, 'resources');
  const legend = <legend className="mb-3 text-lg font-semibold">Files &amp; links</legend>;

  if (!songId) {
    return (
      <fieldset className="min-w-0 space-y-3">
        {legend}
        <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Save to add files. Sheet music, audio, links and projection files can be attached once the
          song has been saved.
        </p>
        <Messages id="resources-errors" messages={sectionErrors} />
      </fieldset>
    );
  }

  const keys = value.musical?.keys ?? [];
  const keyIds = new Set(keys.flatMap((k) => (k.id ? [k.id] : [])));
  const blocks: Block[] = [
    ...keys.map((k) => ({
      songKeyId: k.id ?? null,
      keyed: true,
      title: `Key of ${k.key}${k.isPrimary ? ' (primary)' : ''}`,
      note: k.id ? undefined : 'Save the song to add files for this key.',
    })),
    { songKeyId: null, keyed: false, title: 'Projection (any key)' },
  ];
  const orphans = items.filter((r) => r.songKeyId !== null && !keyIds.has(r.songKeyId));

  const updateJob = (localId: string, patch: Partial<Job>) =>
    setJobs((js) => js.map((j) => (j.localId === localId ? { ...j, ...patch } : j)));

  const runJob = async (job: Job) => {
    const fail = (error: string) => {
      updateJob(job.localId, { stage: 'failed', error });
      setAnnouncement(`Upload of ${job.label} failed`);
    };
    let ticket = job.uploaded;
    try {
      if (!ticket) {
        updateJob(job.localId, { stage: 'uploading', progress: 0, error: undefined });
        const req = await requestUpload({
          songId,
          songKeyId: job.songKeyId,
          kind: job.kind,
          format: job.format as UploadRequest['format'],
          label: job.label,
          sizeBytes: job.file.size,
          mimeType: job.file.type || 'application/octet-stream',
        });
        if (!req.ok) return fail(req.error.message);
        ticket = req.data;
        await putFile(ticket.uploadUrl, job.file, (p) => updateJob(job.localId, { progress: p }));
        updateJob(job.localId, { uploaded: ticket });
      }
      updateJob(job.localId, { stage: 'finalizing', progress: 1, error: undefined });
      const done = await finalizeUpload(ticket.resourceId);
      if (!done.ok) return fail(done.error.message);
      setJobs((js) => js.filter((j) => j.localId !== job.localId));
      setItems((is) => [...is, done.data]);
      setAnnouncement(`Uploaded ${job.label}`);
    } catch {
      fail('Upload failed. Check your connection and try again.');
    }
  };

  const startUploads = (
    songKeyId: UUID | null,
    files: Array<{ file: File; kind: ResourceKind; label: string }>,
  ) => {
    const created = files.map(({ file, kind, label }): Job => ({
      localId: `job-${++jobSeq.current}`,
      songKeyId,
      kind,
      format: formatFromFileName(file.name)!,
      label,
      file,
      progress: 0,
      stage: 'uploading',
    }));
    setJobs((js) => [...js, ...created]);
    created.forEach((j) => void runJob(j));
  };

  const remove = async (r: Resource) => {
    try {
      const result = await deleteResource(r.id);
      if (!result.ok) {
        toast.error(`Couldn't delete ${r.label}: ${result.error.message}`);
        return;
      }
      setItems((is) => is.filter((i) => i.id !== r.id));
      setAnnouncement(`Deleted ${r.label}`);
    } catch {
      toast.error(`Couldn't delete ${r.label}`);
    }
  };

  const open = async (r: Resource) => {
    try {
      const result = await getSignedResourceUrl(r.id);
      if (!result.ok) return void toast.error(`Couldn't open ${r.label}: ${result.error.message}`);
      if (r.format === 'pdf') setViewer({ url: result.data.url, title: r.label });
      else if (AUDIO_FORMATS.has(r.format)) setAudio((a) => ({ ...a, [r.id]: result.data.url }));
      else window.open(result.data.url, '_blank', 'noopener');
    } catch {
      toast.error(`Couldn't open ${r.label}`);
    }
  };

  const saveLink = async (input: ResourceLinkInput, existing?: Resource) => {
    try {
      const result = existing ? await updateLink(existing.id, input) : await addLink(input);
      if (result.ok) {
        setItems((is) =>
          existing ? is.map((i) => (i.id === existing.id ? result.data : i)) : [...is, result.data],
        );
        setAnnouncement(`${existing ? 'Updated' : 'Added'} link ${result.data.label}`);
      }
      return result;
    } catch {
      return {
        ok: false as const,
        error: { code: 'INTERNAL' as const, message: "Couldn't save the link. Try again." },
      };
    }
  };

  const rowFor = (r: Resource, block?: Block) =>
    editing === r.id && block ? (
      <li key={r.id}>
        <LinkForm
          songId={songId}
          block={block}
          initial={r}
          onSubmit={(input) => saveLink(input, r)}
          onCancel={() => setEditing(null)}
        />
      </li>
    ) : (
      <ResourceRow
        key={r.id}
        resource={r}
        audioUrl={audio[r.id]}
        onOpen={r.storagePath ? () => void open(r) : undefined}
        onEdit={r.format === 'url' && block ? () => setEditing(r.id) : undefined}
        onRemove={() => remove(r)}
      />
    );

  return (
    <fieldset className="min-w-0 space-y-5" disabled={disabled}>
      {legend}
      <Messages id="resources-errors" messages={sectionErrors} />
      {keys.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Add a key in the Musical section to attach sheet music, audio and links.
        </p>
      )}
      {blocks.map((block) => {
        const mine = items
          .filter(
            (r) => r.songKeyId === block.songKeyId && (block.keyed || r.kind === 'projection'),
          )
          .sort(byKind);
        const blockJobs = jobs.filter((j) => j.songKeyId === block.songKeyId);
        const usable = !block.keyed || block.songKeyId !== null;
        return (
          <section
            key={block.songKeyId ?? `${block.title}`}
            aria-label={block.title}
            className="space-y-3 rounded-lg border p-3"
          >
            <h3 className="font-medium">{block.title}</h3>
            {block.note && <p className="text-sm text-muted-foreground">{block.note}</p>}
            {usable && (
              <>
                {mine.length + blockJobs.length > 0 ? (
                  <ul className="space-y-2">
                    {mine.map((r) => rowFor(r, block))}
                    {blockJobs.map((j) => (
                      <JobRow
                        key={j.localId}
                        job={j}
                        onRetry={() => void runJob(j)}
                        onDismiss={() => setJobs((js) => js.filter((x) => x.localId !== j.localId))}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No files or links yet.</p>
                )}
                <UploadZone
                  block={block}
                  takenLabels={[...mine.map((r) => r.label), ...blockJobs.map((j) => j.label)]}
                  onFiles={(files) => startUploads(block.songKeyId, files)}
                />
                <LinkForm songId={songId} block={block} onSubmit={(input) => saveLink(input)} />
              </>
            )}
          </section>
        );
      })}
      {orphans.length > 0 && (
        <section aria-label="Removed keys" className="space-y-3 rounded-lg border p-3">
          <h3 className="font-medium">Removed keys</h3>
          <p className="text-sm text-muted-foreground">
            These belong to a key you removed. They are deleted when you save.
          </p>
          <ul className="space-y-2">{orphans.sort(byKind).map((r) => rowFor(r))}</ul>
        </section>
      )}
      {viewer && (
        <PdfViewer url={viewer.url} title={viewer.title} onClose={() => setViewer(null)} />
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </fieldset>
  );
}

/** Loading placeholder while the song being edited is fetched. */
export function ResourcesSectionSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading files and links">
      <Skeleton className="h-6 w-32" />
      {[0, 1].map((i) => (
        <div key={i} className="space-y-2 rounded-lg border p-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}
