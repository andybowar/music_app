import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/types/domain';

const signOut = vi.fn<() => Promise<ActionResult<void>>>();
vi.mock('@/features/auth/actions', () => ({ signOut }));

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const { ACCOUNT_STATUS_COPY, AccountStatus } = await import('./AccountStatus');

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const USER = { name: 'Ana Example', email: 'ana@example.test' };

describe('AccountStatus', () => {
  it('pending: says the request is awaiting approval, and who is signed in', () => {
    render(<AccountStatus status="pending" {...USER} />);
    expect(screen.getByRole('heading', { name: 'Awaiting approval' })).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_STATUS_COPY.pending.body)).toBeInTheDocument();
    expect(screen.getByText(/Signed in as/)).toHaveTextContent(
      'Signed in as Ana Example (ana@example.test)',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('rejected: says the request was declined', () => {
    render(<AccountStatus status="rejected" {...USER} />);
    expect(screen.getByRole('heading', { name: 'Request declined' })).toBeInTheDocument();
    expect(screen.getByText(ACCOUNT_STATUS_COPY.rejected.body)).toBeInTheDocument();
  });

  it('approved: links to the library', () => {
    render(<AccountStatus status="approved" {...USER} />);
    expect(screen.getByRole('link', { name: 'Go to the library' })).toHaveAttribute(
      'href',
      '/library',
    );
  });

  it('signs out from the keyboard, showing a pending state, then goes to /login', async () => {
    let resolve!: (r: ActionResult<void>) => void;
    signOut.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<AccountStatus status="pending" {...USER} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveFocus();
    await user.keyboard('{Enter}');
    const busy = screen.getByRole('button', { name: 'Signing out…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).toHaveFocus();

    // A second press while pending does nothing.
    await user.keyboard('{Enter}');
    expect(signOut).toHaveBeenCalledTimes(1);

    await act(async () => resolve({ ok: true, data: undefined }));
    expect(router.replace).toHaveBeenCalledWith('/login');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('shows an error if sign-out fails, and lets the user retry', async () => {
    signOut.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INTERNAL', message: 'Something went wrong.' },
    });
    const user = userEvent.setup();
    render(<AccountStatus status="rejected" {...USER} />);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(router.replace).not.toHaveBeenCalled();

    signOut.mockResolvedValueOnce({ ok: true, data: undefined });
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(router.replace).toHaveBeenCalledWith('/login');
  });

  it('fits narrow screens (360px): full-width button, long emails wrap, no fixed widths', () => {
    const { container } = render(
      <AccountStatus status="pending" name="Ana" email={`${'a'.repeat(60)}@example.test`} />,
    );
    expect(screen.getByRole('button', { name: 'Sign out' })).toHaveClass('w-full', 'h-10');
    expect(screen.getByText(/Signed in as/)).toHaveClass('break-words');
    expect(container.innerHTML).not.toMatch(/\b(min-)?w-\[\d+px\]/);
  });
});
