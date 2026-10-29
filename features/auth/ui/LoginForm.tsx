'use client';

import type { ComponentProps, FormEvent, ReactNode } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signInWithPassword } from '@/features/auth/actions';

export type FieldErrors = Record<string, string[] | undefined>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Client-side check mirroring the server schema, so obvious mistakes skip a round trip. */
export function validateEmail(value: string): string | undefined {
  const email = value.trim();
  if (!email) return 'Enter your email address.';
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
  return undefined;
}

/** Labelled input with its error message wired up for assistive tech. */
export function AuthField({
  label,
  error,
  hint,
  ...inputProps
}: Omit<ComponentProps<'input'>, 'id' | 'aria-invalid' | 'aria-describedby'> & {
  label: string;
  error?: string;
  hint?: ReactNode;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        className="h-10"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        {...inputProps}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level error banner; `role="alert"` announces it when it appears. */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </p>
  );
}

/**
 * Email + password sign-in (REQ-AUTH-02). On success navigates to `next`, which
 * the page has already sanitized (defaults to `/library`, REQ-NAV-02).
 */
export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const emailError = validateEmail(email);
    const errors: FieldErrors = {
      email: emailError ? [emailError] : undefined,
      password: password ? undefined : ['Enter your password.'],
    };
    setFormError(null);
    setFieldErrors(errors);
    if (errors.email || errors.password) return;

    startTransition(async () => {
      const result = await signInWithPassword(email, password);
      if (result.ok) {
        router.replace(next);
        router.refresh();
        return;
      }
      setFieldErrors(result.error.fieldErrors ?? {});
      setFormError(result.error.fieldErrors ? null : result.error.message);
      setPassword('');
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <FormAlert message={formError} />
      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email?.[0]}
        readOnly={pending}
      />
      <AuthField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password?.[0]}
        readOnly={pending}
      />
      {/* aria-disabled (not disabled) keeps focus on the button while pending. */}
      <Button
        type="submit"
        size="lg"
        className="w-full aria-disabled:opacity-50"
        aria-disabled={pending || undefined}
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className="text-center text-sm">
        <Link
          href="/reset"
          className="inline-flex min-h-10 items-center text-primary underline underline-offset-4 hover:decoration-2"
        >
          Forgot your password?
        </Link>
      </p>
    </form>
  );
}
