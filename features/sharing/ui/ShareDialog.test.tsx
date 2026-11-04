import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ListActionsProvider } from '@/features/lists/ui/AddToListAction';
import { CurrentListProvider } from '@/features/lists/ui/CurrentList';
import { NavListActions } from '@/features/lists/ui/NavListActions';
import { LIST_IDS, getList } from '@/fixtures';
import type { ActionResult, Share } from '@/types/domain';

import {
  MAX_RECIPIENTS,
  ShareActionsProvider,
  ShareDialog,
  describeShare,
  expiryFor,
  parseRecipients,
  shareStatus,
  type ShareActions,
} from './ShareDialog';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/library',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

const list = getList(LIST_IDS.bg41926);
const NOW = new Date('2026-11-03T12:00:00Z');

const share = (overrides: Partial<Share> = {}): Share => ({
  id: 'share-1',
  listId: list.id,
  tokenPrefix: 'AbC123',
  expiresAt: null,
  revokedAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  ...overrides,
});

const URL_ = 'https://app.example.test/share/' + 'Z'.repeat(43);

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

beforeEach(() => {
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

afterEach(cleanup);

function fakeActions(overrides: Partial<ShareActions> = {}) {
  const actions = {
    listShares: vi.fn(async () => ({ ok: true, data: [share()] }) as ActionResult<Share[]>),
    createShare: vi.fn(async (_listId: string, options?: { expiresAt?: string | null }) => ({
      ok: true as const,
      data: {
        ...share({ id: 'share-new', tokenPrefix: 'ZZZZZZ', expiresAt: options?.expiresAt ?? null }),
        url: URL_,
      },
    })),
    revokeShare: vi.fn(async () => ({ ok: true as const, data: undefined })),
    sendShareEmail: vi.fn(async () => ({ ok: true as const, data: undefined })),
    ...overrides,
  };
  return actions;
}

function setup(actions = fakeActions()) {
  const onOpenChange = vi.fn();
  const user = userEvent.setup();
  render(
    <ShareActionsProvider actions={actions as unknown as ShareActions}>
      <ShareDialog list={list} open onOpenChange={onOpenChange} />
    </ShareActionsProvider>,
  );
  return { user, actions, onOpenChange };
}

describe('helpers', () => {
  it('expiryFor: none is null, 7d and 30d are days ahead', () => {
    expect(expiryFor('none', NOW)).toBeNull();
    expect(expiryFor('7d', NOW)).toBe('2026-11-10T12:00:00.000Z');
    expect(expiryFor('30d', NOW)).toBe('2026-12-03T12:00:00.000Z');
  });

  it('parseRecipients splits, trims, lower-cases and de-duplicates', () => {
    expect(
      parseRecipients(' A@example.com, b@example.com;\na@example.com  c@example.org '),
    ).toEqual({ to: ['a@example.com', 'b@example.com', 'c@example.org'] });
  });

  it('parseRecipients rejects empty, malformed and too many', () => {
    expect(parseRecipients(' , ')).toEqual({ error: 'Add at least one email address.' });
    expect(parseRecipients('a@example.com, nope')).toEqual({
      error: "“nope” doesn't look like an email address.",
    });
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `p${i}@example.com`);
    expect(parseRecipients(many.join(','))).toEqual({
      error: `Send to at most ${MAX_RECIPIENTS} people at a time.`,
    });
    expect(parseRecipients(many.slice(0, MAX_RECIPIENTS).join(','))).toHaveProperty('to');
  });

  it('shareStatus and describeShare', () => {
    expect(shareStatus(share(), NOW)).toBe('active');
    expect(shareStatus(share({ expiresAt: '2026-11-10T00:00:00Z' }), NOW)).toBe('active');
    expect(shareStatus(share({ expiresAt: '2026-11-02T00:00:00Z' }), NOW)).toBe('expired');
    expect(shareStatus(share({ revokedAt: '2026-11-02T00:00:00Z' }), NOW)).toBe('revoked');

    expect(describeShare(share(), NOW, 'en-US')).toBe('Created Nov 1, 2026 · Never expires');
    expect(describeShare(share({ expiresAt: '2026-11-10T12:00:00Z' }), NOW, 'en-US')).toBe(
      'Created Nov 1, 2026 · Expires Nov 10, 2026',
    );
    expect(describeShare(share({ expiresAt: '2026-11-02T12:00:00Z' }), NOW, 'en-US')).toBe(
      'Created Nov 1, 2026 · Expired Nov 2, 2026',
    );
    expect(describeShare(share({ revokedAt: '2026-11-02T12:00:00Z' }), NOW, 'en-US')).toBe(
      'Created Nov 1, 2026 · Revoked Nov 2, 2026',
    );
  });
});

describe('ShareDialog', () => {
  it('lists existing links by prefix only, with Revoke for active ones', async () => {
    const actions = fakeActions({
      listShares: vi.fn(async () => ({
        ok: true as const,
        data: [
          share(),
          share({ id: 'share-2', tokenPrefix: 'OldOne', revokedAt: NOW.toISOString() }),
        ],
      })),
    });
    setup(actions);
    expect(screen.getByRole('dialog', { name: `Share “${list.name}”` })).toBeInTheDocument();
    expect(await screen.findByText('Link AbC123…')).toBeInTheDocument();
    expect(screen.getByText('Link OldOne…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke Link AbC123…' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke Link OldOne…' })).toBeNull();
    expect(actions.listShares).toHaveBeenCalledWith(list.id);
  });

  it('shows a loading state, then the empty state', async () => {
    let resolve: (v: ActionResult<Share[]>) => void = () => {};
    const actions = fakeActions({
      listShares: vi.fn(() => new Promise<ActionResult<Share[]>>((r) => (resolve = r))),
    });
    setup(actions);
    expect(screen.getByLabelText('Loading links')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
    resolve({ ok: true, data: [] });
    expect(await screen.findByText('No links yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeEnabled();
  });

  it('shows an error with Try again when links cannot be loaded', async () => {
    const listShares = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { code: 'FORBIDDEN', message: 'Not allowed.' } })
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ ok: true, data: [] });
    const { user } = setup(fakeActions({ listShares }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Not allowed.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No links yet.')).toBeInTheDocument();
  });

  it('creates a link with an expiry, shows it once and copies it', async () => {
    const writeText = vi.fn(async () => {});
    const { user, actions } = setup();
    // After userEvent.setup(), which installs its own clipboard.
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await screen.findByText('Link AbC123…');

    await user.click(screen.getByRole('combobox', { name: 'Expiry' }));
    await user.click(await screen.findByRole('option', { name: 'Expires in 7 days' }));
    const before = Date.now();
    await user.click(screen.getByRole('button', { name: 'Create link' }));

    expect(await screen.findByLabelText('New link')).toHaveValue(URL_);
    const [listId, options] = vi.mocked(actions.createShare).mock.calls[0]!;
    expect(listId).toBe(list.id);
    const ms = Date.parse(options!.expiresAt!) - before;
    expect(ms).toBeGreaterThan(7 * 86_400_000 - 5_000);
    expect(ms).toBeLessThan(7 * 86_400_000 + 5_000);
    // The new link joins the list by prefix.
    expect(screen.getByText('Link ZZZZZZ…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create another link' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(toastMock.success).toHaveBeenCalledWith('Link copied');
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('a failed copy selects the link and says so', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('denied');
    });
    const { user } = setup();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await screen.findByText('Link AbC123…');
    await user.click(screen.getByRole('button', { name: 'Create link' }));
    await user.click(await screen.findByRole('button', { name: 'Copy link' }));
    expect(toastMock.error).toHaveBeenCalledWith("Couldn't copy the link", expect.anything());
  });

  it('never-expiring by default; shows a create error', async () => {
    const createShare = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'FORBIDDEN' as const, message: 'You cannot share this list.' },
    }));
    const { user } = setup(fakeActions({ createShare }));
    await screen.findByText('Link AbC123…');
    await user.click(screen.getByRole('button', { name: 'Create link' }));
    expect(createShare).toHaveBeenCalledWith(list.id, { expiresAt: null });
    expect(await screen.findByRole('alert')).toHaveTextContent('You cannot share this list.');
    expect(screen.queryByLabelText('New link')).toBeNull();
  });

  it('revokes a link', async () => {
    const { user, actions } = setup();
    await user.click(await screen.findByRole('button', { name: 'Revoke Link AbC123…' }));
    expect(actions.revokeShare).toHaveBeenCalledWith('share-1');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Revoke Link AbC123…' })).toBeNull(),
    );
    const row = screen.getByText('Link AbC123…').closest('li')!;
    expect(within(row).getByText(/Revoked/)).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith('Link AbC123… revoked', expect.anything());
  });

  it('keeps the link when revoking fails', async () => {
    const revokeShare = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'FORBIDDEN' as const, message: 'Nope.' },
    }));
    const { user } = setup(fakeActions({ revokeShare }));
    await user.click(await screen.findByRole('button', { name: 'Revoke Link AbC123…' }));
    expect(toastMock.error).toHaveBeenCalledWith("Couldn't revoke the link", {
      description: 'Nope.',
    });
    expect(screen.getByRole('button', { name: 'Revoke Link AbC123…' })).toBeEnabled();
  });

  it('checks recipients before sending', async () => {
    const { user, actions } = setup();
    await screen.findByText('Link AbC123…');
    await user.click(screen.getByRole('button', { name: 'Send email' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Add at least one email address.');
    await user.type(screen.getByLabelText('Email addresses'), 'not-an-address');
    await user.click(screen.getByRole('button', { name: 'Send email' }));
    expect(screen.getByRole('alert')).toHaveTextContent("doesn't look like an email address");
    expect(screen.getByLabelText('Email addresses')).toHaveAttribute('aria-invalid', 'true');
    expect(actions.sendShareEmail).not.toHaveBeenCalled();
  });

  it('emails the list, then reloads links (the email made one)', async () => {
    const { user, actions } = setup();
    await screen.findByText('Link AbC123…');
    await user.type(screen.getByLabelText('Email addresses'), 'a@example.com, B@example.com');
    await user.click(screen.getByRole('button', { name: 'Send email' }));
    expect(actions.sendShareEmail).toHaveBeenCalledWith(list.id, [
      'a@example.com',
      'b@example.com',
    ]);
    await waitFor(() => expect(toastMock.success).toHaveBeenCalledWith('Email sent to 2 people'));
    expect(screen.getByLabelText('Email addresses')).toHaveValue('');
    await waitFor(() => expect(actions.listShares).toHaveBeenCalledTimes(2));
  });

  it('shows the server message when sending fails', async () => {
    const sendShareEmail = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'RATE_LIMITED' as const, message: 'Try again later.' },
    }));
    const { user } = setup(fakeActions({ sendShareEmail }));
    await screen.findByText('Link AbC123…');
    await user.type(screen.getByLabelText('Email addresses'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Send email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again later.');
  });

  it('shows a field error from the server', async () => {
    const sendShareEmail = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: 'VALIDATION' as const,
        message: 'Invalid input.',
        fieldErrors: { to: ['Send to at most 20 people at a time.'] },
      },
    }));
    const { user } = setup(fakeActions({ sendShareEmail }));
    await screen.findByText('Link AbC123…');
    await user.type(screen.getByLabelText('Email addresses'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Send email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Send to at most 20 people');
  });
});

describe('nav Share (REQ-NAV-04)', () => {
  it('opens the dialog for the current list', async () => {
    const actions = fakeActions();
    const user = userEvent.setup();
    render(
      <ShareActionsProvider actions={actions as unknown as ShareActions}>
        <CurrentListProvider initial={list}>
          <ListActionsProvider
            lists={[]}
            createList={vi.fn()}
            addListItem={vi.fn()}
            removeListItem={vi.fn()}
          >
            <NavListActions />
          </ListActionsProvider>
        </CurrentListProvider>
      </ShareActionsProvider>,
    );
    const nav = within(screen.getByTestId('nav-desktop'));
    await user.click(nav.getByRole('button', { name: `Share “${list.name}”` }));
    expect(await screen.findByRole('dialog', { name: `Share “${list.name}”` })).toBeVisible();
    expect(await screen.findByText('Link AbC123…')).toBeInTheDocument();
    expect(actions.listShares).toHaveBeenCalledWith(list.id);
  });
});
