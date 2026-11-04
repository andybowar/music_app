'use client';

import { Check, Copy, Link2, Mail } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import type {
  createShare,
  listShares,
  revokeShare,
  sendShareEmail,
} from '@/features/sharing/server';
import type { ActionResult, List, Share } from '@/types/domain';

// ----- Actions -----------------------------------------------------------------------------

/** The sharing server actions the dialog calls (contracts/api.md, SHR-01/SHR-03/SHR-05). */
export interface ShareActions {
  createShare: typeof createShare;
  listShares: typeof listShares;
  revokeShare: typeof revokeShare;
  sendShareEmail: typeof sendShareEmail;
}

/**
 * The real server actions, loaded on first use. The dialog sits in the nav on every page, so
 * this keeps the sharing module out of the initial bundle, and keeps views that merely render
 * the (closed) dialog from importing server code in their unit tests.
 */
const loadServer = () => import('@/features/sharing/server');
const serverActions: ShareActions = {
  createShare: async (...args) => (await loadServer()).createShare(...args),
  listShares: async (...args) => (await loadServer()).listShares(...args),
  revokeShare: async (...args) => (await loadServer()).revokeShare(...args),
  sendShareEmail: async (...args) => (await loadServer()).sendShareEmail(...args),
};

const ShareActionsContext = createContext<ShareActions>(serverActions);

/**
 * Swaps the sharing server actions for stand-ins, e.g. fixture-backed fakes in the
 * `/dev/share-dialog` gallery. The app never mounts it, so `ShareDialog` calls the real actions.
 */
export function ShareActionsProvider({
  actions,
  children,
}: {
  actions: ShareActions;
  children: ReactNode;
}) {
  return <ShareActionsContext.Provider value={actions}>{children}</ShareActionsContext.Provider>;
}

const FALLBACK_ERROR = 'Something went wrong. Please try again.';

/** Run an action and turn a thrown error (e.g. network) into an `ActionResult`. */
async function settle<T>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch {
    return { ok: false, error: { code: 'INTERNAL', message: FALLBACK_ERROR } };
  }
}

// ----- Pure helpers (exported for tests) ---------------------------------------------------

/** Expiry choices for a new link (REQ-SHARE-01: optional expiry). */
export const EXPIRY_OPTIONS = [
  { value: 'none', label: 'Never expires', days: null },
  { value: '7d', label: 'Expires in 7 days', days: 7 },
  { value: '30d', label: 'Expires in 30 days', days: 30 },
] as const;
export type ExpiryChoice = (typeof EXPIRY_OPTIONS)[number]['value'];

/** The `expiresAt` to send for an expiry choice: null for "never". */
export function expiryFor(choice: ExpiryChoice, now: Date = new Date()): string | null {
  const days = EXPIRY_OPTIONS.find((o) => o.value === choice)?.days ?? null;
  return days === null ? null : new Date(now.getTime() + days * 86_400_000).toISOString();
}

/** Recipients per email (contracts/api.md `sendShareEmail`). */
export const MAX_RECIPIENTS = 20;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Email addresses typed into the recipients field: separated by commas, semicolons, spaces or
 * new lines; trimmed, lower-cased and de-duplicated. Returns an error message instead when one
 * doesn't look like an address, there are none, or there are too many.
 */
export function parseRecipients(text: string): { to: string[] } | { error: string } {
  const to = [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (to.length === 0) return { error: 'Add at least one email address.' };
  const bad = to.find((s) => !EMAIL_PATTERN.test(s));
  if (bad) return { error: `“${bad}” doesn't look like an email address.` };
  if (to.length > MAX_RECIPIENTS) {
    return { error: `Send to at most ${MAX_RECIPIENTS} people at a time.` };
  }
  return { to };
}

export type ShareStatus = 'active' | 'expired' | 'revoked';

export function shareStatus(share: Share, now: Date = new Date()): ShareStatus {
  if (share.revokedAt) return 'revoked';
  if (share.expiresAt && Date.parse(share.expiresAt) <= now.getTime()) return 'expired';
  return 'active';
}

function formatDate(iso: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** "Created 3 Nov 2026 · Expires 10 Nov 2026", in the user's locale. */
export function describeShare(share: Share, now: Date = new Date(), locale?: string): string {
  const created = `Created ${formatDate(share.createdAt, locale)}`;
  switch (shareStatus(share, now)) {
    case 'revoked':
      return `${created} · Revoked ${formatDate(share.revokedAt!, locale)}`;
    case 'expired':
      return `${created} · Expired ${formatDate(share.expiresAt!, locale)}`;
    default:
      return share.expiresAt
        ? `${created} · Expires ${formatDate(share.expiresAt, locale)}`
        : `${created} · Never expires`;
  }
}

// ----- Dialog ------------------------------------------------------------------------------

export interface ShareDialogProps {
  list: List;
  open: boolean;
  onOpenChange(open: boolean): void;
}

type Loaded = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready' };

/**
 * Share a list (REQ-SHARE-01, REQ-SHARE-02; contracts/ui.md `ShareDialog`): create a read-only
 * link with an optional expiry and copy it, email the list to up to 20 people, and revoke
 * existing links. A link's full address exists only when it is created (CR SHR-01, SHR-05), so
 * existing links are listed by the first characters of their token.
 */
export function ShareDialog({ list, open, onOpenChange }: ShareDialogProps) {
  const actions = useContext(ShareActionsContext);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [shares, setShares] = useState<Share[]>([]);
  const [created, setCreated] = useState<{ url: string; id: string } | null>(null);

  const load = useCallback(async () => {
    setLoaded({ state: 'loading' });
    const result = await settle(() => actions.listShares(list.id));
    if (!result.ok) {
      setLoaded({ state: 'error', message: result.error.message });
      return;
    }
    setShares(result.data);
    setLoaded({ state: 'ready' });
  }, [actions, list.id]);

  useEffect(() => {
    if (!open) return;
    setCreated(null);
    void load();
  }, [open, load]);

  const kind = list.type === 'setlist' ? 'setlist' : 'playlist';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share “{list.name}”</DialogTitle>
          <DialogDescription>
            Anyone with a link can see this {kind}, including your key, tempo and energy changes,
            without signing in. Opening files still needs an account.
          </DialogDescription>
        </DialogHeader>

        {loaded.state === 'error' ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-sm text-destructive">{loaded.message}</p>
            <Button variant="outline" className="min-h-tap" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <CreateLinkSection
              list={list}
              created={created}
              disabled={loaded.state === 'loading'}
              onCreated={(share) => {
                setCreated({ url: share.url, id: share.id });
                const { url: _url, ...rest } = share;
                setShares((prev) => [rest, ...prev]);
              }}
            />
            <EmailSection list={list} onSent={() => void load()} />
            <ExistingLinks
              loading={loaded.state === 'loading'}
              shares={shares}
              createdId={created?.id ?? null}
              onRevoked={(revoked) =>
                setShares((prev) => prev.map((s) => (s.id === revoked.id ? revoked : s)))
              }
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ----- Create and copy ---------------------------------------------------------------------

function CreateLinkSection({
  list,
  created,
  disabled,
  onCreated,
}: {
  list: List;
  created: { url: string } | null;
  disabled: boolean;
  onCreated(share: Share & { url: string }): void;
}) {
  const id = useId();
  const actions = useContext(ShareActionsContext);
  const [expiry, setExpiry] = useState<ExpiryChoice>('none');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setPending(true);
    setError(null);
    const result = await settle(() =>
      actions.createShare(list.id, { expiresAt: expiryFor(expiry) }),
    );
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onCreated(result.data);
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <h3 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
        <Link2 aria-hidden="true" className="size-4" />
        Create a link
      </h3>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={`${id}-expiry`} className="text-sm font-medium">
            Expiry
          </label>
          <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryChoice)}>
            <SelectTrigger id={`${id}-expiry`} className="h-tap! w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="min-h-tap">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="min-h-tap" disabled={disabled || pending} onClick={() => void create()}>
          {pending ? 'Creating…' : created ? 'Create another link' : 'Create link'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {created && <NewLink url={created.url} />}
    </section>
  );
}

/** The link just created, with Copy. Shown once: it can't be retrieved again later. */
function NewLink({ url }: { url: string }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => setCopied(false), [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied');
    } catch {
      inputRef.current?.select();
      toast.error("Couldn't copy the link", {
        description: 'It is selected: copy it with your keyboard or long-press.',
      });
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-muted/40 p-3">
      <label htmlFor={`${id}-url`} className="text-sm font-medium">
        New link
      </label>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id={`${id}-url`}
          readOnly
          value={url}
          className="min-w-0 flex-1 font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
          aria-describedby={`${id}-once`}
        />
        <Button variant="outline" className="min-h-tap shrink-0" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <p id={`${id}-once`} className="text-xs text-muted-foreground">
        Copy it now. For security the full link is shown only once; you can always create another.
      </p>
    </div>
  );
}

// ----- Email -------------------------------------------------------------------------------

function EmailSection({ list, onSent }: { list: List; onSent(): void }) {
  const id = useId();
  const actions = useContext(ShareActionsContext);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = parseRecipients(text);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    setPending(true);
    setError(null);
    const result = await settle(() => actions.sendShareEmail(list.id, parsed.to));
    setPending(false);
    if (!result.ok) {
      const field = result.error.fieldErrors
        ? Object.values(result.error.fieldErrors).flat()[0]
        : undefined;
      setError(field ?? result.error.message);
      return;
    }
    const n = parsed.to.length;
    toast.success(n === 1 ? 'Email sent' : `Email sent to ${n} people`);
    setText('');
    onSent();
  }

  return (
    <section aria-labelledby={`${id}-title`}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-2">
        <h3 id={`${id}-title`} className="flex items-center gap-2 text-sm font-semibold">
          <Mail aria-hidden="true" className="size-4" />
          Email the list
        </h3>
        <label htmlFor={`${id}-to`} className="text-sm font-medium">
          Email addresses
        </label>
        <Textarea
          id={`${id}-to`}
          value={text}
          rows={2}
          placeholder="name@example.com, another@example.com"
          onChange={(e) => setText(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        />
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          Up to {MAX_RECIPIENTS} people, separated by commas. Each gets a summary and a link that
          never expires (you can revoke it below). Recipients don&apos;t see each other&apos;s
          addresses.
        </p>
        {error && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" variant="outline" className="min-h-tap self-start" disabled={pending}>
          {pending ? 'Sending…' : 'Send email'}
        </Button>
      </form>
    </section>
  );
}

// ----- Existing links ----------------------------------------------------------------------

function ExistingLinks({
  loading,
  shares,
  createdId,
  onRevoked,
}: {
  loading: boolean;
  shares: Share[];
  createdId: string | null;
  onRevoked(share: Share): void;
}) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2">
      <h3 id={`${id}-title`} className="text-sm font-semibold">
        Links
      </h3>
      {loading ? (
        <div aria-busy="true" aria-label="Loading links" className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : shares.length === 0 ? (
        <p className="text-sm text-muted-foreground">No links yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {shares.map((share) => (
            <ShareRow
              key={share.id}
              share={share}
              isNew={share.id === createdId}
              onRevoked={onRevoked}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ShareRow({
  share,
  isNew,
  onRevoked,
}: {
  share: Share;
  isNew: boolean;
  onRevoked(share: Share): void;
}) {
  const actions = useContext(ShareActionsContext);
  const [pending, setPending] = useState(false);
  const status = shareStatus(share);
  const name = `Link ${share.tokenPrefix}…`;

  async function revoke() {
    setPending(true);
    const result = await settle(() => actions.revokeShare(share.id));
    setPending(false);
    if (!result.ok) {
      toast.error("Couldn't revoke the link", { description: result.error.message });
      return;
    }
    toast.success(`${name} revoked`, { description: 'It no longer opens the list.' });
    onRevoked({ ...share, revokedAt: new Date().toISOString() });
  }

  return (
    <li className="flex items-center justify-between gap-3 p-3">
      <div className="flex min-w-0 flex-col">
        <span className={status === 'active' ? 'font-medium' : 'text-muted-foreground'}>
          <span className="font-mono">{name}</span>
          {isNew && <span className="ml-2 text-xs text-muted-foreground">(new)</span>}
        </span>
        <span className="text-xs text-muted-foreground" suppressHydrationWarning>
          {describeShare(share)}
        </span>
      </div>
      {status === 'active' && (
        <Button
          variant="outline"
          size="sm"
          className="min-h-tap shrink-0"
          disabled={pending}
          aria-label={`Revoke ${name}`}
          onClick={() => void revoke()}
        >
          {pending ? 'Revoking…' : 'Revoke'}
        </Button>
      )}
    </li>
  );
}
