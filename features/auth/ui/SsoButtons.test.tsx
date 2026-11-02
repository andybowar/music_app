import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/types/domain';

const signInWithOidc =
  vi.fn<
    (provider: 'google' | 'microsoft', next?: string) => Promise<ActionResult<{ url: string }>>
  >();
const signInWithSaml =
  vi.fn<(emailOrDomain: string, next?: string) => Promise<ActionResult<{ url: string }>>>();
vi.mock('@/features/auth/actions', () => ({ signInWithOidc, signInWithSaml }));

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

describe('SsoButtons SAML (AUTH-03)', () => {
  const ORG = 'Sign in with your organization';

  it('flag off (default): no SAML UI', () => {
    render(<SsoButtons providers={['google']} next="/library" />);
    expect(screen.queryByRole('button', { name: ORG })).not.toBeInTheDocument();
    cleanup();
    const { container } = render(<SsoButtons providers={[]} next="/library" saml={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('flag on: renders even with no OIDC providers', () => {
    render(<SsoButtons providers={[]} next="/library" saml />);
    expect(screen.getByRole('button', { name: ORG })).toHaveAttribute('aria-expanded', 'false');
  });

  it('reveals a work email field, then starts SAML with next and navigates', async () => {
    const user = userEvent.setup();
    const pending = deferred<ActionResult<{ url: string }>>();
    signInWithSaml.mockReturnValue(pending.promise);
    render(<SsoButtons providers={['google']} next="/songs/1" saml navigate={navigate} />);

    await user.click(screen.getByRole('button', { name: ORG }));
    const email = screen.getByRole('textbox', { name: 'Work email' });
    expect(email).toHaveFocus();
    await user.type(email, 'ann@example.org{Enter}');
    expect(signInWithSaml).toHaveBeenCalledWith('ann@example.org', '/songs/1');
    expect(screen.getByRole('button', { name: 'Redirecting…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // OIDC is blocked while SAML is in flight.
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(signInWithOidc).not.toHaveBeenCalled();

    await act(async () => pending.resolve({ ok: true, data: { url: 'https://idp.test/saml' } }));
    expect(navigate).toHaveBeenCalledWith('https://idp.test/saml');
    expect(screen.getByRole('button', { name: 'Redirecting…' })).toBeInTheDocument();
    // A second submit while leaving does nothing.
    await user.click(screen.getByRole('button', { name: 'Redirecting…' }));
    expect(signInWithSaml).toHaveBeenCalledTimes(1);
  });

  it('asks for an email before calling the server', async () => {
    const user = userEvent.setup();
    render(<SsoButtons providers={[]} next="/library" saml navigate={navigate} />);
    await user.click(screen.getByRole('button', { name: ORG }));
    await user.click(screen.getByRole('button', { name: 'Continue with your organization' }));
    expect(screen.getByRole('textbox', { name: 'Work email' })).toHaveAccessibleDescription(
      'Enter your work email address.',
    );
    expect(signInWithSaml).not.toHaveBeenCalled();
  });

  it('shows a friendly error when no IdP is set up for the domain, and allows a retry', async () => {
    const user = userEvent.setup();
    signInWithSaml.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'NOT_FOUND',
        message: 'We couldn’t find organization sign-in for that email.',
      },
    });
    render(<SsoButtons providers={['google']} next="/library" saml navigate={navigate} />);
    await user.click(screen.getByRole('button', { name: ORG }));
    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'ann@unknown.example');
    await user.click(screen.getByRole('button', { name: 'Continue with your organization' }));
    expect(screen.getByRole('textbox', { name: 'Work email' })).toHaveAccessibleDescription(
      'We couldn’t find organization sign-in for that email.',
    );
    expect(navigate).not.toHaveBeenCalled();

    // OIDC is usable again after the failure.
    signInWithOidc.mockResolvedValueOnce({ ok: true, data: { url: 'https://idp.test/g' } });
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(navigate).toHaveBeenCalledWith('https://idp.test/g');
  });

  it('shows the field error from server validation', async () => {
    const user = userEvent.setup();
    signInWithSaml.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: 'Invalid input.',
        fieldErrors: { emailOrDomain: ['Enter your work email address.'] },
      },
    });
    render(<SsoButtons providers={[]} next="/library" saml navigate={navigate} />);
    await user.click(screen.getByRole('button', { name: ORG }));
    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'nope{Enter}');
    expect(screen.getByRole('textbox', { name: 'Work email' })).toHaveAccessibleDescription(
      'Enter your work email address.',
    );
  });

  it('cannot open the SAML form while an OIDC sign-in is in flight', async () => {
    const user = userEvent.setup();
    signInWithOidc.mockReturnValue(deferred<ActionResult<{ url: string }>>().promise);
    render(<SsoButtons providers={['google']} next="/library" saml navigate={navigate} />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    await user.click(screen.getByRole('button', { name: ORG }));
    expect(screen.queryByRole('textbox', { name: 'Work email' })).not.toBeInTheDocument();
  });
});
