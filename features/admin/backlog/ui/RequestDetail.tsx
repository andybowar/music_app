'use client';

import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';

import {
  FEATURE_REQUEST_STATUSES,
  KIND_LABEL,
  STATUS_LABEL,
  type FeatureRequestDetail,
  type FeatureRequestStatus,
  type RequestActions,
} from '../types';
import { formatDate } from './format';
import { ImageViewer } from './ImageViewer';
import { SERVER_REQUEST_ACTIONS } from './requestActions';
import { REQUESTS_HREF, requestHref } from './RequestList';

export interface RequestDetailProps {
  request: FeatureRequestDetail;
  actions?: Partial<RequestActions>;
}

/**
 * One enhancement or change request (ADM-06, REQ-ADM-02): status selector, the description as
 * plain text with its line breaks, a thumbnail grid that opens each wireframe full size, and
 * Edit / Delete (with confirmation).
 */
export function RequestDetail({ request, actions }: RequestDetailProps) {
  const router = useRouter();
  const api: RequestActions = {
    ...SERVER_REQUEST_ACTIONS,
    navigate: (href) => router.push(href),
    ...actions,
  };
  const [status, setStatus] = useState<FeatureRequestStatus>(request.status);
  const [savingStatus, setSavingStatus] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const statusId = useId();

  async function changeStatus(next: FeatureRequestStatus) {
    const previous = status;
    setStatus(next);
    setSavingStatus(true);
    const result = await api.updateRequest(request.id, { status: next });
    setSavingStatus(false);
    if (result.ok) {
      toast.success(`Status set to ${STATUS_LABEL[next]}`);
    } else {
      setStatus(previous);
      toast.error(`Couldn't change the status. ${result.error.message}`);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    const result = await api.deleteRequest(request.id);
    setDeleting(false);
    if (!result.ok) {
      toast.error(`Couldn't delete the request. ${result.error.message}`);
      return;
    }
    setConfirming(false);
    toast.success(`Deleted “${request.title}”`);
    api.navigate(REQUESTS_HREF);
  }

  const edited = request.updatedAt !== request.createdAt;

  return (
    <article className="grid min-w-0 gap-5">
      <header className="grid gap-3">
        <h1 className="text-xl font-semibold break-words">{request.title}</h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge variant="outline">{KIND_LABEL[request.kind]}</Badge>
          <label htmlFor={statusId} className="flex items-center gap-2">
            <span className="font-medium">Status</span>
            <select
              id={statusId}
              value={status}
              disabled={savingStatus}
              onChange={(e) => void changeStatus(e.target.value as FeatureRequestStatus)}
              className="min-h-tap rounded-md border bg-background px-2"
            >
              {FEATURE_REQUEST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          Submitted by {request.createdByName ?? 'Unknown'} on{' '}
          <time dateTime={request.createdAt}>{formatDate(request.createdAt)}</time>
          {edited ? (
            <>
              {' '}
              · updated <time dateTime={request.updatedAt}>{formatDate(request.updatedAt)}</time>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="min-h-tap">
            <Link href={`${requestHref(request.id)}/edit`}>
              <Pencil aria-hidden /> Edit
            </Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-tap text-destructive"
            onClick={() => setConfirming(true)}
          >
            <Trash2 aria-hidden /> Delete
          </Button>
        </div>
      </header>

      <section aria-labelledby={`${statusId}-desc`} className="grid gap-2">
        <h2 id={`${statusId}-desc`} className="text-base font-semibold">
          Description
        </h2>
        {request.description.trim() ? (
          <p className="text-sm break-words whitespace-pre-wrap">{request.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No description.</p>
        )}
      </section>

      <section aria-labelledby={`${statusId}-img`} className="grid gap-2">
        <h2 id={`${statusId}-img`} className="text-base font-semibold">
          Wireframes
        </h2>
        {request.images.length === 0 ? (
          <p className="text-sm text-muted-foreground">No wireframes.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {request.images.map((image, i) => (
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

      <ImageViewer images={request.images} index={viewing} onIndexChange={setViewing} />

      <Dialog open={confirming} onOpenChange={(open) => !deleting && setConfirming(open)}>
        <DialogContent>
          <DialogTitle>Delete this request?</DialogTitle>
          <DialogDescription>
            “{request.title}” and its {request.images.length === 1 ? 'image' : 'images'} will be
            removed. This can&apos;t be undone.
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
              {deleting ? 'Deleting…' : 'Delete request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
