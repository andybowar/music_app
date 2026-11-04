'use client';

import { CheckCircle2 } from 'lucide-react';
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
import { newUploadItem } from '@/features/admin/backlog/ui/RequestForm';
import { imageFilesFrom } from '@/features/admin/backlog/ui/uploads';
import type { UUID } from '@/types/domain';

import {
  BUG_DESCRIPTION_MAX,
  BUG_EXPECTED_MAX,
  BUG_TITLE_MAX,
  BUGS_HREF,
  bugHref,
  bugReportInputSchema,
  type BugReport,
  type BugReportActions,
  type ImageMimeType,
} from '../types';
import { SERVER_BUG_ACTIONS } from './bugActions';
import {
  captureEnvironment,
  checkScreenshotFiles,
  describeBrowser,
  describeViewport,
  type CapturedEnvironment,
} from './details';
import { ScreenshotUploader, type UploadItem } from './ScreenshotUploader';

export interface BugReportFormProps {
  /** The page the user came from (`/bugs/new?from=…`), already checked to be a safe path. */
  pagePath?: string;
  actions?: Partial<BugReportActions>;
}

export interface BugReportFormValue {
  title: string;
  description: string;
  expected: string;
}

const EMPTY: BugReportFormValue = { title: '', description: '', expected: '' };

const revoke = (url: string) => {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
};

/**
 * Report a bug (ADM-08, REQ-ADM-03). Submitting saves the report first, then uploads each
 * screenshot (with progress) and finalizes it. A failed screenshot doesn't lose the report:
 * the form stays open with Retry and Remove on that image. When everything is in, it shows
 * "Thanks — we got it" with links to the report and to report another bug.
 */
export function BugReportForm({ pagePath, actions }: BugReportFormProps) {
  const router = useRouter();
  const api: BugReportActions = {
    ...SERVER_BUG_ACTIONS,
    navigate: (href) => router.push(href),
    ...actions,
  };

  const [value, setValue] = useState<BugReportFormValue>(EMPTY);
  const [environment, setEnvironment] = useState<CapturedEnvironment | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<BugReport | null>(null);
  const [done, setDone] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [rejections, setRejections] = useState<string[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => setEnvironment(captureEnvironment(window)), []);
  useEffect(() => () => itemsRef.current.forEach((i) => revoke(i.previewUrl)), []);

  const patchItem = (key: string, patch: Partial<UploadItem>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  function addFiles(files: File[]) {
    if (saved) return;
    const { accepted, rejected } = checkScreenshotFiles(files, items.length);
    setRejections(rejected);
    if (accepted.length > 0)
      setItems((list) => [...list, ...accepted.map((f) => newUploadItem(f))]);
  }

  function removeItem(key: string) {
    const rest = itemsRef.current.filter((i) => i.key !== key);
    setItems((list) => {
      const item = list.find((i) => i.key === key);
      if (item) revoke(item.previewUrl);
      return list.filter((i) => i.key !== key);
    });
    setRejections([]);
    // Removing the last failed screenshot of a saved report finishes it.
    if (saved && rest.every((i) => i.stage === 'done')) setDone(true);
  }

  /** Upload one item to report `reportId`; resolves to whether it ended up saved. */
  async function upload(reportId: UUID, item: UploadItem): Promise<boolean> {
    patchItem(item.key, { stage: 'uploading', progress: 0, error: undefined });
    const ticket = await api.createBugImageUpload(reportId, {
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
    const final = await api.finalizeBugImage(ticket.data.pendingId);
    if (!final.ok) {
      patchItem(item.key, { stage: 'failed', error: final.error.message });
      return false;
    }
    patchItem(item.key, { stage: 'done' });
    return true;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving || saved) return;
    setFormError(null);
    const input = {
      title: value.title,
      description: value.description,
      expected: value.expected,
      pagePath: pagePath ?? null,
      userAgent: environment?.userAgent ?? null,
      viewport: environment?.viewport ?? null,
    };
    const parsed = bugReportInputSchema.safeParse(input);
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
      const result = await api.createBugReport(input);
      if (!result.ok) {
        const fe = result.error.fieldErrors;
        setFieldErrors(fe ?? {});
        setFormError(fe ? null : result.error.message);
        return;
      }
      setSaved(result.data);
      let allOk = true;
      for (const item of itemsRef.current) {
        if (item.stage === 'done') continue;
        if (!(await upload(result.data.id, item))) allOk = false;
      }
      if (allOk) setDone(true);
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
      if (ok && others.every((i) => i.stage === 'done')) setDone(true);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    items.forEach((i) => revoke(i.previewUrl));
    setValue(EMPTY);
    setItems([]);
    setRejections([]);
    setFieldErrors({});
    setFormError(null);
    setSaved(null);
    setDone(false);
  }

  function onPaste(e: ClipboardEvent) {
    const files = imageFilesFrom(e.clipboardData);
    if (files.length === 0) return; // plain text: let the field have it
    e.preventDefault();
    addFiles(files);
  }

  if (saved && done) {
    return (
      <BugReportSuccess
        report={saved}
        imageCount={items.filter((i) => i.stage === 'done').length}
        onReportAnother={reset}
      />
    );
  }

  const failed = items.filter((i) => i.stage === 'failed');
  const notice =
    saved && failed.length > 0 && !saving ? (
      <div role="alert" className="grid gap-2 rounded-md border border-destructive p-3 text-sm">
        <p>
          Your report was sent, but{' '}
          {failed.length === 1 ? '1 screenshot' : `${failed.length} screenshots`} didn&apos;t
          upload. Retry or remove {failed.length === 1 ? 'it' : 'them'} above.
        </p>
        <Link href={bugHref(saved.id)} className="font-medium underline underline-offset-4">
          View the report without {failed.length === 1 ? 'it' : 'them'}
        </Link>
      </div>
    ) : null;

  return (
    <BugReportFormView
      value={value}
      onChange={setValue}
      pagePath={pagePath ?? null}
      environment={environment}
      fieldErrors={fieldErrors}
      formError={formError}
      saving={saving}
      locked={saved !== null}
      items={items}
      rejections={rejections}
      notice={notice}
      onSubmit={submit}
      onPaste={onPaste}
      onAddFiles={addFiles}
      onRemoveItem={removeItem}
      onRetryItem={(key) => void retry(key)}
    />
  );
}

export interface BugReportFormViewProps {
  value: BugReportFormValue;
  onChange(value: BugReportFormValue): void;
  pagePath: string | null;
  /** Null until the browser has been read (first render, and on the server). */
  environment: CapturedEnvironment | null;
  fieldErrors: Record<string, string[]>;
  formError: string | null;
  saving: boolean;
  /** The report is saved: text fields are read-only, only screenshots can be retried. */
  locked?: boolean;
  items: UploadItem[];
  rejections: string[];
  notice?: ReactNode;
  onSubmit(e: FormEvent): void;
  onPaste?(e: ClipboardEvent): void;
  onAddFiles(files: File[]): void;
  onRemoveItem(key: string): void;
  onRetryItem(key: string): void;
}

/** The form's markup with every piece of state passed in (the gallery renders fixed states). */
export function BugReportFormView({
  value,
  onChange,
  pagePath,
  environment,
  fieldErrors,
  formError,
  saving,
  locked = false,
  items,
  rejections,
  notice,
  onSubmit,
  onPaste,
  onAddFiles,
  onRemoveItem,
  onRetryItem,
}: BugReportFormViewProps) {
  const id = useId();
  const ids = {
    title: `${id}-title`,
    description: `${id}-description`,
    expected: `${id}-expected`,
    errTitle: `${id}-err-title`,
    errDescription: `${id}-err-description`,
    errExpected: `${id}-err-expected`,
    countDescription: `${id}-count-description`,
    sent: `${id}-sent`,
  };
  const titleError = fieldErrors.title?.[0];
  const descError = fieldErrors.description?.[0];
  const expectedError = fieldErrors.expected?.[0];
  const textDisabled = saving || locked;
  const describedBy = (...parts: (string | false | undefined)[]) =>
    parts.filter(Boolean).join(' ') || undefined;

  return (
    <form onSubmit={onSubmit} onPaste={onPaste} noValidate className="grid min-w-0 gap-5">
      <div className="grid gap-1">
        <label htmlFor={ids.title} className="text-sm font-medium">
          What went wrong?
        </label>
        <Input
          id={ids.title}
          value={value.title}
          maxLength={BUG_TITLE_MAX}
          disabled={textDisabled}
          placeholder="For example: the song list doesn't load"
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          aria-invalid={titleError ? true : undefined}
          aria-describedby={describedBy(titleError && ids.errTitle)}
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
          What happened?
        </label>
        <Textarea
          id={ids.description}
          value={value.description}
          rows={6}
          disabled={textDisabled}
          placeholder="What you did, step by step, and what you saw."
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          aria-invalid={descError ? true : undefined}
          aria-describedby={describedBy(ids.countDescription, descError && ids.errDescription)}
        />
        <p id={ids.countDescription} className="text-xs text-muted-foreground">
          {value.description.length.toLocaleString()} / {BUG_DESCRIPTION_MAX.toLocaleString()}
        </p>
        {descError ? (
          <p id={ids.errDescription} className="text-sm text-destructive">
            {descError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-1">
        <label htmlFor={ids.expected} className="text-sm font-medium">
          What did you expect? <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          id={ids.expected}
          value={value.expected}
          rows={3}
          maxLength={BUG_EXPECTED_MAX}
          disabled={textDisabled}
          onChange={(e) => onChange({ ...value, expected: e.target.value })}
          aria-invalid={expectedError ? true : undefined}
          aria-describedby={describedBy(expectedError && ids.errExpected)}
        />
        {expectedError ? (
          <p id={ids.errExpected} className="text-sm text-destructive">
            {expectedError}
          </p>
        ) : null}
      </div>

      <ScreenshotUploader
        items={items}
        rejections={rejections}
        disabled={saving}
        allowAdd={!locked}
        onAddFiles={onAddFiles}
        onRemoveItem={onRemoveItem}
        onRetryItem={onRetryItem}
      />

      <section aria-labelledby={ids.sent} className="grid gap-2 rounded-md bg-muted/50 p-3 text-sm">
        <h2 id={ids.sent} className="font-medium">
          Sent with your report
        </h2>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Page</dt>
          <dd className="break-all">{pagePath ?? 'Not known'}</dd>
          <dt className="text-muted-foreground">Browser</dt>
          <dd className="break-words">
            {environment ? describeBrowser(environment.userAgent) : 'Detecting…'}
          </dd>
          <dt className="text-muted-foreground">Screen size</dt>
          <dd>{environment ? describeViewport(environment.viewport) : 'Detecting…'}</dd>
        </dl>
      </section>

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}
      {notice}

      {locked ? null : (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="min-h-tap" disabled={saving}>
            {saving ? 'Sending…' : 'Send report'}
          </Button>
          <Button asChild variant="outline" className="min-h-tap">
            <Link href={pagePath ?? BUGS_HREF}>Cancel</Link>
          </Button>
        </div>
      )}
    </form>
  );
}

export interface BugReportSuccessProps {
  report: Pick<BugReport, 'id' | 'title'>;
  imageCount: number;
  onReportAnother(): void;
}

/** "Thanks — we got it", after the report and every screenshot are in. */
export function BugReportSuccess({ report, imageCount, onReportAnother }: BugReportSuccessProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <div role="status" className="grid gap-3 rounded-lg border p-4">
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="flex items-center gap-2 text-lg font-semibold outline-none"
      >
        <CheckCircle2 aria-hidden className="size-5 text-primary" />
        Thanks — we got it
      </h2>
      <p className="text-sm break-words">
        Your report “{report.title}”
        {imageCount > 0
          ? ` and ${imageCount === 1 ? '1 screenshot' : `${imageCount} screenshots`}`
          : ''}{' '}
        reached the admins. You can check its status any time under your bug reports.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild className="min-h-tap">
          <Link href={bugHref(report.id)}>View your report</Link>
        </Button>
        <Button type="button" variant="outline" className="min-h-tap" onClick={onReportAnother}>
          Report another bug
        </Button>
      </div>
    </div>
  );
}
