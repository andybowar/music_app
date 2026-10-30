import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/types/domain';

type SignUpInput = { name: string; email: string; password: string };
const signUpWithPassword = vi.fn<(input: SignUpInput) => Promise<ActionResult<void>>>();
vi.mock('@/features/auth/actions', () => ({ signUpWithPassword }));

const { SIGNUP_SENT_MESSAGE, SignupForm, validateSignup } = await import('./SignupForm');

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const field = (label: string) => screen.getByLabelText(label);

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  values: Partial<Record<'Name' | 'Email' | 'Password' | 'Confirm password', string>>,
) {
  for (const [label, value] of Object.entries(values)) {
    if (value) await user.type(field(label), value);
  }
}

describe('validateSignup', () => {
  const ok = {
    name: 'Ana',
    email: 'ana@example.test',
    password: 'pw-123456',
    confirm: 'pw-123456',
  };

  it('accepts a complete request', () => {
    expect(validateSignup(ok)).toEqual({});
  });

  it.each([
    [{ name: '  ' }, 'name', 'Enter your name.'],
    [{ name: 'x'.repeat(201) }, 'name', 'Use at most 200 characters.'],
    [{ email: '' }, 'email', 'Enter your email address.'],
    [{ email: 'nope' }, 'email', 'Enter a valid email address.'],
    [{ password: 'short', confirm: 'short' }, 'password', 'Use at least 8 characters.'],
    [
      { password: 'x'.repeat(73), confirm: 'x'.repeat(73) },
      'password',
      'Use at most 72 characters.',
    ],
    [{ confirm: 'different' }, 'confirm', 'Passwords do not match.'],
  ])('rejects %o', (override, key, message) => {
    expect(validateSignup({ ...ok, ...override })[key]).toEqual([message]);
  });
});

describe('SignupForm', () => {
  it('shows field errors without calling the server', async () => {
    const user = userEvent.setup();
    render(<SignupForm />);
    await user.click(screen.getByRole('button', { name: 'Request access' }));

    expect(field('Name')).toHaveAccessibleDescription('Enter your name.');
    expect(field('Email')).toHaveAccessibleDescription('Enter your email address.');
    expect(field('Password')).toHaveAccessibleDescription(/Use at least 8 characters\./);
    expect(field('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(signUpWithPassword).not.toHaveBeenCalled();
  });

  it('is keyboard operable: tab through the fields and submit with Enter', async () => {
    let resolve!: (r: ActionResult<void>) => void;
    signUpWithPassword.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = userEvent.setup();
    render(<SignupForm />);

    await user.tab();
    expect(field('Name')).toHaveFocus();
    await user.keyboard('Ana Example');
    await user.tab();
    expect(field('Email')).toHaveFocus();
    await user.keyboard('ana@example.test');
    await user.tab();
    await user.keyboard('pw-123456');
    await user.tab();
    expect(field('Confirm password')).toHaveFocus();
    await user.keyboard('pw-123456{Enter}');

    // Loading state: the button stays focusable but announces it's busy.
    const busy = screen.getByRole('button', { name: 'Sending request…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(field('Email')).toHaveAttribute('readonly');
    expect(signUpWithPassword).toHaveBeenCalledWith({
      name: 'Ana Example',
      email: 'ana@example.test',
      password: 'pw-123456',
    });

    await act(async () => resolve({ ok: true, data: undefined }));
    expect(screen.getByRole('status')).toHaveTextContent(SIGNUP_SENT_MESSAGE);
    expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('ignores a second submit while pending', async () => {
    signUpWithPassword.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    render(<SignupForm />);
    await fill(user, {
      Name: 'Ana',
      Email: 'ana@example.test',
      Password: 'pw-123456',
      'Confirm password': 'pw-123456',
    });
    await user.click(screen.getByRole('button', { name: 'Request access' }));
    await user.click(screen.getByRole('button', { name: 'Sending request…' }));
    expect(signUpWithPassword).toHaveBeenCalledTimes(1);
  });

  it('shows a form-level error (e.g. rate limiting) and keeps the form', async () => {
    signUpWithPassword.mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Too many attempts.' },
    });
    const user = userEvent.setup();
    render(<SignupForm />);
    await fill(user, {
      Name: 'Ana',
      Email: 'ana@example.test',
      Password: 'pw-123456',
      'Confirm password': 'pw-123456{Enter}',
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(field('Email')).toHaveValue('ana@example.test');
  });

  it('shows server field errors next to the field', async () => {
    signUpWithPassword.mockResolvedValue({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: 'Choose a stronger password.',
        fieldErrors: { password: ['Choose a stronger password.'] },
      },
    });
    const user = userEvent.setup();
    render(<SignupForm />);
    await fill(user, {
      Name: 'Ana',
      Email: 'ana@example.test',
      Password: 'pw-123456',
      'Confirm password': 'pw-123456{Enter}',
    });
    expect(await screen.findByText('Choose a stronger password.')).toBeInTheDocument();
    expect(field('Password')).toHaveAccessibleDescription(/Choose a stronger password\./);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('links back to sign in', () => {
    render(<SignupForm />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('fits narrow screens (360px): full-width controls, no fixed widths, 40px tap targets', () => {
    const { container } = render(<SignupForm />);
    expect(screen.getByRole('button', { name: 'Request access' })).toHaveClass('w-full', 'h-10');
    for (const label of ['Name', 'Email', 'Password', 'Confirm password']) {
      expect(field(label)).toHaveClass('w-full', 'h-10');
    }
    expect(container.innerHTML).not.toMatch(/\b(min-)?w-\[\d+px\]/);
  });
});
