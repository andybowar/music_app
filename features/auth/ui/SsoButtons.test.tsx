import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/types/domain';

const signInWithOidc =
  vi.fn<
    (provider: 'google' | 'microsoft', next?: string) => Promise<ActionResult<{ url: string }>>
  >();
vi.mock('@/features/auth/actions', () => ({ signInWithOidc }));

const { SsoButtons, ssoErrorMessage } = await import('./SsoButtons');

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const navigate = vi.fn();

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('ssoErrorMessage', () => {
  it.each([
    [null, null],
    ['', null],
    ['sso_cancelled', 'Sign-in was cancelled.'],
    ['sso_disabled', 'This account has been disabled. Contact an administrator.'],
    ['made-up', 'We couldn’t sign you in with your organization account. Please try again.'],
  ])('%j → %j', (code, expected) => expect(ssoErrorMessage(code)).toBe(expected));
});

describe('SsoButtons', () => {
  it('renders nothing when no providers are enabled', () => {
    const { container } = render(<SsoButtons providers={[]} next="/library" error="sso_failed" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders only enabled providers, in a fixed order', () => {
    render(<SsoButtons providers={['microsoft', 'google']} next="/library" />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Continue with Google',
      'Continue with Microsoft',
    ]);
    cleanup();
    render(<SsoButtons providers={['microsoft']} next="/library" />);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Continue with Microsoft',
    ]);
  });

  it('starts sign-in with next and navigates to the IdP URL', async () => {
    const user = userEvent.setup();
    const pending = deferred<ActionResult<{ url: string }>>();
    signInWithOidc.mockReturnValue(pending.promise);
    render(<SsoButtons providers={['google', 'microsoft']} next="/songs/1" navigate={navigate} />);

    await user.click(screen.getByRole('button', { name: 'Continue with Microsoft' }));
    expect(signInWithOidc).toHaveBeenCalledWith('microsoft', '/songs/1');
    expect(screen.getByRole('button', { name: 'Redirecting…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    // A second click while busy does nothing.
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(signInWithOidc).toHaveBeenCalledTimes(1);

    await act(async () =>
      pending.resolve({ ok: true, data: { url: 'https://idp.test/authorize' } }),
    );
    expect(navigate).toHaveBeenCalledWith('https://idp.test/authorize');
    // Stays busy while the browser leaves.
    expect(screen.getByRole('button', { name: 'Redirecting…' })).toBeInTheDocument();
  });

  it('works from the keyboard', async () => {
    const user = userEvent.setup();
    signInWithOidc.mockResolvedValue({ ok: true, data: { url: 'https://idp.test/a' } });
    render(<SsoButtons providers={['google']} next="/library" navigate={navigate} />);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(signInWithOidc).toHaveBeenCalledWith('google', '/library');
    expect(navigate).toHaveBeenCalledWith('https://idp.test/a');
  });

  it('shows the error from a failed action and lets the user retry', async () => {
    const user = userEvent.setup();
    signInWithOidc.mockResolvedValueOnce({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'This sign-in option is not available.' },
    });
    render(<SsoButtons providers={['google']} next="/library" navigate={navigate} />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByRole('alert')).toHaveTextContent('This sign-in option is not available.');
    expect(navigate).not.toHaveBeenCalled();

    signInWithOidc.mockResolvedValueOnce({ ok: true, data: { url: 'https://idp.test/b' } });
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(navigate).toHaveBeenCalledWith('https://idp.test/b');
  });

  it('shows the callback error passed in from the page', () => {
    render(<SsoButtons providers={['google']} next="/library" error="sso_no_account" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your organization account is not linked to a branch yet. Ask an administrator to invite you.',
    );
  });
});
