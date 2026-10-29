import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/types/domain';

const signInWithPassword =
  vi.fn<(email: string, password: string) => Promise<ActionResult<void>>>();
vi.mock('@/features/auth/actions', () => ({ signInWithPassword }));

const router = { replace: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const { LoginForm, validateEmail } = await import('./LoginForm');

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('validateEmail', () => {
  it.each([
    ['', 'Enter your email address.'],
    ['   ', 'Enter your email address.'],
    ['ana', 'Enter a valid email address.'],
    ['ana@example', 'Enter a valid email address.'],
    ['ana@example.test', undefined],
  ])('%j → %j', (input, expected) => expect(validateEmail(input)).toBe(expected));
});

describe('LoginForm', () => {
  it('shows field errors and does not call the action for empty input', async () => {
    const user = userEvent.setup();
    render(<LoginForm next="/library" />);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Enter your email address.');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription('Enter your password.');
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('is fully keyboard operable: tab through fields and submit with Enter', async () => {
    signInWithPassword.mockResolvedValue({ ok: true, data: undefined });
    const user = userEvent.setup();
    render(<LoginForm next="/songs/1" />);

    await user.tab();
    expect(screen.getByLabelText('Email')).toHaveFocus();
    await user.keyboard('ana@example.test');
    await user.tab();
    expect(screen.getByLabelText('Password')).toHaveFocus();
    await user.keyboard('secret-pw{Enter}');

    expect(signInWithPassword).toHaveBeenCalledWith('ana@example.test', 'secret-pw');
    expect(router.replace).toHaveBeenCalledWith('/songs/1');
    expect(router.refresh).toHaveBeenCalled();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute(
      'href',
      '/reset',
    );
  });

  it('shows a pending state and ignores repeat submits while signing in', async () => {
    const pending = deferred<ActionResult<void>>();
    signInWithPassword.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<LoginForm next="/library" />);

    await user.type(screen.getByLabelText('Email'), 'ana@example.test');
    await user.type(screen.getByLabelText('Password'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    const busy = screen.getByRole('button', { name: 'Signing in…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy.closest('form')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
    await user.click(busy);
    expect(signInWithPassword).toHaveBeenCalledTimes(1);

    await act(async () => pending.resolve({ ok: true, data: undefined }));
    expect(router.replace).toHaveBeenCalledWith('/library');
  });

  it('shows the generic server error, clears the password and stays on the page', async () => {
    signInWithPassword.mockResolvedValue({
      ok: false,
      error: { code: 'UNAUTHENTICATED', message: 'Incorrect email or password.' },
    });
    const user = userEvent.setup();
    render(<LoginForm next="/library" />);

    await user.type(screen.getByLabelText('Email'), 'ana@example.test');
    await user.type(screen.getByLabelText('Password'), 'wrong{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Email')).toHaveValue('ana@example.test');
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign in' })).not.toHaveAttribute('aria-disabled');
  });

  it('shows server field errors next to their fields', async () => {
    signInWithPassword.mockResolvedValue({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: 'Invalid input.',
        fieldErrors: { email: ['Enter a valid email address.'] },
      },
    });
    const user = userEvent.setup();
    render(<LoginForm next="/library" />);
    await user.type(screen.getByLabelText('Email'), 'ana@example.test');
    await user.type(screen.getByLabelText('Password'), 'pw{Enter}');

    expect(screen.getByLabelText('Email')).toHaveAccessibleDescription(
      'Enter a valid email address.',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('fits narrow screens (360px): full-width controls, no fixed widths, 40px tap targets', () => {
    const { container } = render(<LoginForm next="/library" />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveClass('w-full', 'h-10');
    for (const input of screen.getAllByRole('textbox').concat(screen.getByLabelText('Password'))) {
      expect(input).toHaveClass('w-full', 'h-10');
    }
    expect(container.innerHTML).not.toMatch(/\b(min-)?w-\[\d+px\]/);
  });
});
