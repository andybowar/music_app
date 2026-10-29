import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/types/domain';

const requestPasswordReset = vi.fn<(email: string) => Promise<ActionResult<void>>>();
const confirmPasswordReset = vi.fn<(token: string, pw: string) => Promise<ActionResult<void>>>();
vi.mock('@/features/auth/actions', () => ({ requestPasswordReset, confirmPasswordReset }));

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const { RESET_SENT_MESSAGE, ResetConfirmForm, ResetRequestForm } = await import('./ResetForms');

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('ResetRequestForm', () => {
  it('validates the email client-side', async () => {
    const user = userEvent.setup();
    render(<ResetRequestForm />);
    await user.type(screen.getByLabelText('Email'), 'nope{Enter}');
    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Enter a valid email address.',
    );
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it('shows pending, then the same neutral confirmation for any email', async () => {
    let resolve!: (r: ActionResult<void>) => void;
    requestPasswordReset.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<ResetRequestForm />);

    await user.type(screen.getByLabelText('Email'), 'nobody@example.test{Enter}');
    expect(screen.getByRole('button', { name: 'Sending…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await act(async () => resolve({ ok: true, data: undefined }));

    expect(requestPasswordReset).toHaveBeenCalledWith('nobody@example.test');
    expect(screen.getByRole('status')).toHaveTextContent(RESET_SENT_MESSAGE);
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
  });

  it('shows server errors (e.g. rate limiting)', async () => {
    requestPasswordReset.mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Too many attempts.' },
    });
    const user = userEvent.setup();
    render(<ResetRequestForm />);
    await user.type(screen.getByLabelText('Email'), 'ana@example.test{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('ResetConfirmForm', () => {
  it('requires 8+ characters and matching confirmation before submitting', async () => {
    const user = userEvent.setup();
    render(<ResetConfirmForm token="code-1" />);
    const pw = screen.getByLabelText('New password');
    const confirm = screen.getByLabelText('Confirm new password');

    await user.type(pw, 'short{Enter}');
    expect(pw).toHaveAccessibleDescription(/Use at least 8 characters\./);
    expect(pw).toHaveAttribute('aria-invalid', 'true');

    await user.clear(pw);
    await user.type(pw, 'long-enough-1');
    await user.type(confirm, 'different-1{Enter}');
    expect(confirm).toHaveAccessibleDescription('Passwords do not match.');
    expect(confirmPasswordReset).not.toHaveBeenCalled();
  });

  it('submits by keyboard and lands on /library', async () => {
    confirmPasswordReset.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(<ResetConfirmForm token="code-1" />);

    await user.tab();
    expect(screen.getByLabelText('New password')).toHaveFocus();
    await user.keyboard('long-enough-1');
    await user.tab();
    await user.keyboard('long-enough-1{Enter}');

    expect(confirmPasswordReset).toHaveBeenCalledWith('code-1', 'long-enough-1');
    expect(router.replace).toHaveBeenCalledWith('/library');
  });

  it('offers a new link when the code is invalid or expired', async () => {
    confirmPasswordReset.mockResolvedValue({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'This reset link is invalid or has expired.' },
    });
    const user = userEvent.setup();
    render(<ResetConfirmForm token="stale" />);
    await user.type(screen.getByLabelText('New password'), 'long-enough-1');
    await user.type(screen.getByLabelText('Confirm new password'), 'long-enough-1{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
    expect(screen.getByRole('link', { name: 'Request a new reset link' })).toHaveAttribute(
      'href',
      '/reset',
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows a server password error on the field', async () => {
    confirmPasswordReset.mockResolvedValue({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: 'Choose a stronger password.',
        fieldErrors: { password: ['Choose a stronger password.'] },
      },
    });
    const user = userEvent.setup();
    render(<ResetConfirmForm token="code-1" />);
    await user.type(screen.getByLabelText('New password'), 'long-enough-1');
    await user.type(screen.getByLabelText('Confirm new password'), 'long-enough-1{Enter}');
    expect(screen.getByLabelText('New password')).toHaveAccessibleDescription(
      /Choose a stronger password\./,
    );
    expect(screen.queryByRole('link', { name: 'Request a new reset link' })).toBeNull();
  });

  it('uses full-width controls with 40px tap targets (360px screens)', () => {
    render(<ResetConfirmForm token="code-1" />);
    expect(screen.getByRole('button', { name: 'Set new password' })).toHaveClass('w-full', 'h-10');
    expect(screen.getByLabelText('New password')).toHaveClass('w-full', 'h-10');
  });
});
