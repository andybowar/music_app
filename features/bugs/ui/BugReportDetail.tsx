'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { FeatureRequestImage } from '@/features/admin/backlog/types';
import { formatDate } from '@/features/admin/backlog/ui/format';
import { ImageViewer } from '@/features/admin/backlog/ui/ImageViewer';

import {
  ADMIN_BUGS_HREF,
  BUG_ADMIN_NOTE_MAX,
  BUG_REPORT_STATUSES,
  BUG_STATUS_LABEL,
  type BugReportActions,
  type BugReportDetail as BugReportDetailData,
  type BugReportStatus,
} from '../types';
import { SERVER_BUG_ACTIONS } from './bugActions';
import { BugStatusBadge } from './BugReportList';
import { describeBrowser, describeViewport } from './details';

export interface BugReportDetailProps {
  report: BugReportDetailData;
  /** Triage controls (status, note to the reporter, delete) and the reporter's name. */
  admin?: boolean;
  actions?: Partial<BugReportActions>;
}

/**
 * One bug report (ADM-08, REQ-ADM-03): what went wrong, what happened, what was expected, the
 * auto-captured page, browser, screen size and app version, and the screenshots (each opens
 * full size). Reporters see the status and the admins' note; admins can change both and
 * delete the report (with confirmation).
 */
export function BugReportDetail({ report, admin = false, actions }: BugReportDetailProps) {
  const router = useRouter();
  const api: BugReportActions = {
    ...SERVER_BUG_ACTIONS,
    navigate: (href) => router.push(href),
    ...actions,
  };
  const id = useId();
  const [status, setStatus] = useState<BugReportStatus>(report.status);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savedNote, setSavedNote] = useState(report.adminNote ?? '');
  const [note, setNote] = useState(report.adminNote ?? '');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function changeStatus(next: BugReportStatus) {
    const previous = status;
    setStatus(next);
    setSavingStatus(true);
    const result = await api.updateBugReport(report.id, { status: next });
    setSavingStatus(false);
    if (result.ok) {
      toast.success(`Status set to ${BUG_STATUS_LABEL[next]}`);
    } else {
      setStatus(previous);
      toast.error(`Couldn't change the status. ${result.error.message}`);
    }
  }

  async function saveNote(e: FormEvent) {
    e.preventDefault();
    if (note.trim().length > BUG_ADMIN_NOTE_MAX) {
      setNoteError(`Keep the note to ${BUG_ADMIN_NOTE_MAX.toLocaleString()} characters or fewer`);
      return;
    }
    setNoteError(null);
    setSavingNote(true);
    const result = await api.updateBugReport(report.id, { adminNote: note });
    setSavingNote(false);
    if (result.ok) {
      const saved = result.data.adminNote ?? '';
      setSavedNote(saved);
      setNote(saved);
      toast.success(saved ? 'Note saved' : 'Note removed');
    } else {
      setNoteError(result.error.fieldErrors?.adminNote?.[0] ?? result.error.message);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    const result = await api.deleteBugReport(report.id);
    setDeleting(false);
    if (!result.ok) {
      toast.error(`Couldn't delete the report. ${result.error.message}`);
      return;
    }
    setConfirming(false);
    toast.success(`Deleted “${report.title}”`);
    api.navigate(ADMIN_BUGS_HREF);
  }

  // ImageViewer (ADM-06) takes backlog image rows; it reads only the name and URL.
  const viewerImages: FeatureRequestImage[] = report.images.map((image) => ({
    ...image,
    requestId: image.reportId,
  }));
  const edited = report.updatedAt !== report.createdAt;

  const details: [string, ReactNode][] = [
    [
      'Page',
      report.pagePath ? (
        <Link
          href={report.pagePath}
          className="break-all underline underline-offset-4 hover:no-underline"
        >
          {report.pagePath}
        </Link>
      ) : (
        'Not known'
      ),
    ],
    [
      'Browser',
      <span key="ua" title={report.userAgent ?? undefined}>
        {describeBrowser(report.userAgent)}
      </span>,
    ],
    ['Screen size', describeViewport(report.viewport)],
    [
      'App version',
      report.appVersion ? (
        <code className="text-xs break-all">{report.appVersion.slice(0, 12)}</code>
      ) : (
        'Not known'
      ),
    ],
  ];
  if (admin) details.unshift(['Reported by', report.createdByName ?? 'Unknown']);

  return (
    <article className="grid min-w-0 gap-5">
      <header className="grid gap-3">
        <h1 className="text-xl font-semibold break-words">{report.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {admin ? (
            <label htmlFor={`${id}-status`} className="flex items-center gap-2">
              <span className="font-medium">Status</span>
              <select
                id={`${id}-status`}
                value={status}
                disabled={savingStatus}
                onChange={(e) => void changeStatus(e.target.value as BugReportStatus)}
                className="min-h-tap rounded-md border bg-background px-2"
              >
                {BUG_REPORT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {BUG_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="flex items-center gap-2">
              <span className="font-medium">Status</span>
              <BugStatusBadge status={status} />
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Reported <time dateTime={report.createdAt}>{formatDate(report.createdAt)}</time>
          {edited ? (
            <>
              {' '}
              · updated <time dateTime={report.updatedAt}>{formatDate(report.updatedAt)}</time>
            </>
          ) : null}
        </p>
        {admin ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-tap text-destructive"
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden /> Delete
            </Button>
          </div>
        ) : null}
      </header>

      {admin ? (
        <form onSubmit={saveNote} className="grid gap-2 rounded-md border p-3" noValidate>
          <label htmlFor={`${id}-note`} className="text-sm font-medium">
            Note to the reporter
          </label>
          <Textarea
            id={`${id}-note`}
            value={note}
            rows={3}
            maxLength={BUG_ADMIN_NOTE_MAX}
            disabled={savingNote}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={noteError ? true : undefined}
            aria-describedby={`${id}-note-hint${noteError ? ` ${id}-note-err` : ''}`}
          />
          <p id={`${id}-note-hint`} className="text-xs text-muted-foreground">
            The reporter sees this on their report.
          </p>
          {noteError ? (
            <p id={`${id}-note-err`} className="text-sm text-destructive">
              {noteError}
            </p>
          ) : null}
          <Button
            type="submit"
            size="sm"
            className="min-h-tap justify-self-start"
            disabled={savingNote || note.trim() === savedNote.trim()}
          >
            {savingNote ? 'Saving…' : 'Save note'}
          </Button>
        </form>
      ) : savedNote ? (
        <section
          aria-labelledby={`${id}-note-h`}
          className="grid gap-1 rounded-md border bg-muted/50 p-3"
        >
          <h2 id={`${id}-note-h`} className="text-sm font-semibold">
            Note from the admins
          </h2>
          <p className="text-sm break-words whitespace-pre-wrap">{savedNote}</p>
        </section>
      ) : null}

      <section aria-labelledby={`${id}-what`} className="grid gap-2">
        <h2 id={`${id}-what`} className="text-base font-semibold">
          What happened
        </h2>
        <p className="text-sm break-words whitespace-pre-wrap">{report.description}</p>
      </section>

      <section aria-labelledby={`${id}-expected`} className="grid gap-2">
        <h2 id={`${id}-expected`} className="text-base font-semibold">
          What they expected
        </h2>
        {report.expected ? (
          <p className="text-sm break-words whitespace-pre-wrap">{report.expected}</p>
        ) : (
          <p className="text-sm text-muted-foreground">Not given.</p>
        )}
      </section>

      <section aria-labelledby={`${id}-details`} className="grid gap-2">
        <h2 id={`${id}-details`} className="text-base font-semibold">
          Details
        </h2>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby={`${id}-img`} className="grid gap-2">
        <h2 id={`${id}-img`} className="text-base font-semibold">
          Screenshots
        </h2>
        {report.images.length === 0 ? (
          <p className="text-sm text-muted-foreground">No screenshots.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {report.images.map((image, i) => (
              <li key={image.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setViewing(i)}
                  className="grid w-full gap-1 rounded-md border p-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring"
                  aria-label={`Open ${image.fileName} full size`}
                >
                  <span className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-muted">
                    {/* reason: short-lived signed URLs can't go through next/image. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image.url} alt="" className="size-full object-contain" />
                  </span>
                  <span className="truncate text-xs">{image.fileName}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ImageViewer images={viewerImages} index={viewing} onIndexChange={setViewing} />

      {admin ? (
        <Dialog open={confirming} onOpenChange={(open) => !deleting && setConfirming(open)}>
          <DialogContent>
            <DialogTitle>Delete this bug report?</DialogTitle>
            <DialogDescription>
              “{report.title}”
              {report.images.length > 0
                ? ` and its ${report.images.length === 1 ? 'screenshot' : 'screenshots'}`
                : ''}{' '}
              will be removed, for the reporter too. This can&apos;t be undone.
            </DialogDescription>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className="min-h-tap"
                disabled={deleting}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="min-h-tap"
                disabled={deleting}
                onClick={() => void confirmDelete()}
              >
                {deleting ? 'Deleting…' : 'Delete report'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </article>
  );
}
