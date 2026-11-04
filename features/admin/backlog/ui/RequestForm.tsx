'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type ReactNode,
} from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { UUID } from '@/types/domain';

import {
  DESCRIPTION_MAX,
  FEATURE_REQUEST_KINDS,
  KIND_LABEL,
  requestInputSchema,
  TITLE_MAX,
  type FeatureRequest,
  type FeatureRequestDetail,
  type FeatureRequestImage,
  type FeatureRequestKind,
  type ImageMimeType,
  type RequestActions,
} from '../types';
import { SERVER_REQUEST_ACTIONS } from './requestActions';
import { REQUESTS_HREF, requestHref } from './RequestList';
import { checkImageFiles, imageFilesFrom } from './uploads';
import { WireframeUploader, type UploadItem } from './WireframeUploader';

export interface RequestFormProps {
  request?: FeatureRequestDetail;
  actions?: Partial<RequestActions>;
}

export interface RequestFormValue {
  kind: FeatureRequestKind;
  title: string;
  description: string;
}

let keySeq = 0;
const previewFor = (file: File) =>
  typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
const revoke = (url: string) => {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
};

/** Make a queued upload item for `file` (exported for the gallery and tests). */
export function newUploadItem(file: File, overrides: Partial<UploadItem> = {}): UploadItem {
  return {
    key: `upload-${++keySeq}`,
    file,
    previewUrl: previewFor(file),
    stage: 'queued',
    progress: 0,
    ...overrides,
  };
}

/**
 * New / edit enhancement or change request (ADM-06, REQ-ADM-02). Submitting saves the request
 * first, then uploads each new wireframe (with progress) and finalizes it. A failed image
 * doesn't lose the request: the form stays open with Retry and Remove on that image.
 */
export function RequestForm({ request, actions }: RequestFormProps) {
  const router = useRouter();
  const api: RequestActions = {
    ...SERVER_REQUEST_ACTIONS,
    navigate: (href) => router.push(href),
    ...actions,
  };

  const [value, setValue] = useState<RequestFormValue>({
    kind: request?.kind ?? 'enhancement',
    title: request?.title ?? '',
    description: request?.description ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<FeatureRequest | null>(request ?? null);
  const [existing, setExisting] = useState<FeatureRequestImage[]>(request?.images ?? []);
  const [removed, setRemoved] = useState<FeatureRequestImage[]>([]);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejections, setRejections] = useState<string[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => () => itemsRef.current.forEach((i) => revoke(i.previewUrl)), []);

  const patchItem = (key: string, patch: Partial<UploadItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  function addFiles(files: File[]) {
    const { accepted, rejected } = checkImageFiles(files, existing.length + items.length);
    setRejections(rejected);
    if (accepted.length > 0)
      setItems((list) => [...list, ...accepted.map((f) => newUploadItem(f))]);
  }

  function removeItem(key: string) {
    setItems((list) => {
      const item = list.find((i) => i.key === key);
      if (item) revoke(item.previewUrl);
      return list.filter((i) => i.key !== key);
    });
    setRejections([]);
  }

  function removeExisting(id: string) {
    const image = existing.find((i) => i.id === id);
    if (!image) return;
    setExisting((list) => list.filter((i) => i.id !== id));
    setRemoved((list) => [...list, image]);
  }

  /** Upload one item to request `requestId`; resolves to whether it ended up saved. */
  async function upload(requestId: UUID, item: UploadItem): Promise<boolean> {
    patchItem(item.key, { stage: 'uploading', progress: 0, error: undefined });
    const ticket = await api.createRequestImageUpload(requestId, {
      fileName: item.file.name || 'Pasted image',
      mimeType: item.file.type as ImageMimeType,
      sizeBytes: item.file.size,
    });
    if (!ticket.ok) {
      patchItem(item.key, { stage: 'failed', error: ticket.error.message });
      return false;
    }
    try {
      await api.putFile(ticket.data.uploadUrl, item.file, (p) =>
        patchItem(item.key, { progress: p }),
      );
    } catch {
      patchItem(item.key, { stage: 'failed', error: 'The upload was interrupted.' });
      return false;
    }
    patchItem(item.key, { stage: 'finalizing', progress: 1 });
    const final = await api.finalizeRequestImage(ticket.data.imageId);
    if (!final.ok) {
      patchItem(item.key, { stage: 'failed', error: final.error.message });
      return false;
    }
    patchItem(item.key, { stage: 'done' });
    return true;
  }

  async function uploadPending(requestId: UUID, list: UploadItem[]): Promise<boolean> {
    let allOk = true;
    for (const item of list) {
      if (item.stage === 'done') continue;
      if (!(await upload(requestId, item))) allOk = false;
    }
    return allOk;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const parsed = requestInputSchema.safeParse(value);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? 'form');
        (errors[field] ??= []).push(issue.message);
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    try {
      const result = saved
        ? await api.updateRequest(saved.id, parsed.data)
        : await api.createRequest(parsed.data);
      if (!result.ok) {
        setFieldErrors(result.error.fieldErrors ?? {});
        setFormError(result.error.fieldErrors ? null : result.error.message);
        return;
      }
      setSaved(result.data);
      const id = result.data.id;

      for (const image of removed) {
        const r = await api.deleteRequestImage(image.id);
        if (!r.ok && r.error.code !== 'NOT_FOUND') {
          setExisting((list) => [...list, image]);
          setFormError(`Couldn't remove ${image.fileName}. ${r.error.message}`);
        }
      }
      setRemoved([]);

      const allOk = await uploadPending(id, itemsRef.current);
      if (allOk) api.navigate(requestHref(id));
    } finally {
      setSaving(false);
    }
  }

  async function retry(key: string) {
    const item = items.find((i) => i.key === key);
    if (!item || !saved) return;
    setSaving(true);
    try {
      const ok = await upload(saved.id, item);
      const others = itemsRef.current.filter((i) => i.key !== key);
      if (ok && others.every((i) => i.stage === 'done')) api.navigate(requestHref(saved.id));
    } finally {
      setSaving(false);
    }
  }

  function onPaste(e: ClipboardEvent) {
    const files = imageFilesFrom(e.clipboardData);
    if (files.length === 0) return; // plain text: let the field have it
    e.preventDefault();
    addFiles(files);
  }

  const failed = items.filter((i) => i.stage === 'failed');
  const notice =
    saved && failed.length > 0 && !saving ? (
      <div role="alert" className="grid gap-2 rounded-md border border-destructive p-3 text-sm">
        <p>
          The request was saved, but {failed.length === 1 ? '1 image' : `${failed.length} images`}{' '}
          didn&apos;t upload: {failed.map((i) => i.file.name).join(', ')}. Retry or remove{' '}
          {failed.length === 1 ? 'it' : 'them'} below.
        </p>
        <Link href={requestHref(saved.id)} className="font-medium underline underline-offset-4">
          View the request without {failed.length === 1 ? 'it' : 'them'}
        </Link>
      </div>
    ) : saved &&
      !request &&
      !saving &&
      items.length > 0 &&
      failed.length === 0 &&
      items.every((i) => i.stage === 'done') ? (
      <p role="status" className="text-sm">
        All images uploaded.{' '}
        <Link href={requestHref(saved.id)} className="font-medium underline underline-offset-4">
          View the request
        </Link>
      </p>
    ) : null;

  return (
    <RequestFormView
      mode={request ? 'edit' : 'new'}
      value={value}
      onChange={setValue}
      fieldErrors={fieldErrors}
      formError={formError}
      saving={saving}
      existing={existing}
      items={items}
      rejections={rejections}
      notice={notice}
      cancelHref={request ? requestHref(request.id) : REQUESTS_HREF}
      onSubmit={submit}
      onPaste={onPaste}
      onAddFiles={addFiles}
      onRemoveItem={removeItem}
      onRetryItem={(key) => void retry(key)}
      onRemoveExisting={removeExisting}
    />
  );
}

export interface RequestFormViewProps {
  mode: 'new' | 'edit';
  value: RequestFormValue;
  onChange(value: RequestFormValue): void;
  fieldErrors: Record<string, string[]>;
  formError: string | null;
  saving: boolean;
  existing: FeatureRequestImage[];
  items: UploadItem[];
  rejections: string[];
  notice?: ReactNode;
  cancelHref: string;
  onSubmit(e: FormEvent): void;
  onPaste?(e: ClipboardEvent): void;
  onAddFiles(files: File[]): void;
  onRemoveItem(key: string): void;
  onRetryItem(key: string): void;
  onRemoveExisting(id: string): void;
}

/** The form's markup with every piece of state passed in (the gallery renders fixed states). */
export function RequestFormView({
  mode,
  value,
  onChange,
  fieldErrors,
  formError,
  saving,
  existing,
  items,
  rejections,
  notice,
  cancelHref,
  onSubmit,
  onPaste,
  onAddFiles,
  onRemoveItem,
  onRetryItem,
  onRemoveExisting,
}: RequestFormViewProps) {
  const ids = { title: useId(), description: useId(), errTitle: useId(), errDesc: useId() };
  const errKindId = useId();
  const titleError = fieldErrors.title?.[0];
  const descError = fieldErrors.description?.[0];
  const kindError = fieldErrors.kind?.[0];

  return (
    <form onSubmit={onSubmit} onPaste={onPaste} noValidate className="grid min-w-0 gap-5">
      <fieldset
        className="grid gap-2"
        aria-describedby={kindError ? errKindId : undefined}
        disabled={saving}
      >
        <legend className="text-sm font-medium">Kind</legend>
        <div className="flex flex-wrap gap-2">
          {FEATURE_REQUEST_KINDS.map((kind) => (
            <label
              key={kind}
              className="flex min-h-tap cursor-pointer items-center gap-2 rounded-md border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-accent"
            >
              <input
                type="radio"
                name="kind"
                value={kind}
                checked={value.kind === kind}
                onChange={() => onChange({ ...value, kind })}
                className="size-4 accent-primary"
              />
              {KIND_LABEL[kind]}
            </label>
          ))}
        </div>
        {kindError ? (
          <p id={errKindId} className="text-sm text-destructive">
            {kindError}
          </p>
        ) : null}
      </fieldset>

      <div className="grid gap-1">
        <label htmlFor={ids.title} className="text-sm font-medium">
          Title
        </label>
        <Input
          id={ids.title}
          value={value.title}
          maxLength={TITLE_MAX}
          disabled={saving}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={titleError ? ids.errTitle : undefined}
          className="min-h-tap"
        />
        {titleError ? (
          <p id={ids.errTitle} className="text-sm text-destructive">
            {titleError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-1">
        <label htmlFor={ids.description} className="text-sm font-medium">
          Description
        </label>
        <Textarea
          id={ids.description}
          value={value.description}
          rows={6}
          disabled={saving}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          aria-invalid={descError ? true : undefined}
          aria-describedby={descError ? ids.errDesc : undefined}
        />
        <p className="text-xs text-muted-foreground">
          {value.description.length.toLocaleString()} / {DESCRIPTION_MAX.toLocaleString()}
        </p>
        {descError ? (
          <p id={ids.errDesc} className="text-sm text-destructive">
            {descError}
          </p>
        ) : null}
      </div>

      <WireframeUploader
        existing={existing}
        items={items}
        rejections={rejections}
        disabled={saving}
        onAddFiles={onAddFiles}
        onRemoveItem={onRemoveItem}
        onRetryItem={onRetryItem}
        onRemoveExisting={onRemoveExisting}
      />

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      {notice}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-tap" disabled={saving}>
          {saving ? 'Saving…' : mode === 'edit' ? 'Save changes' : 'Submit request'}
        </Button>
        <Button asChild variant="outline" className="min-h-tap">
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
