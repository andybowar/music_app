'use client';

import type { FormEvent } from 'react';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { signUpWithPassword } from '@/features/auth/actions';

import { AuthField, type FieldErrors, FormAlert, validateEmail } from './LoginForm';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './ResetForms';

/** Same message whether or not the email already had an account (no user enumeration). */
export const SIGNUP_SENT_MESSAGE =
  'Thanks! Your request is waiting for an administrator to approve it. ' +
  "We'll email you when it's approved. You can sign in any time to check its status.";

const MAX_NAME_LENGTH = 200;

const linkClass =
  'inline-flex min-h-10 items-center text-primary underline underline-offset-4 hover:decoration-2';

/** Client-side checks mirroring the server schema, so obvious mistakes skip a round trip. */
export function validateSignup(values: {
  name: string;
  email: string;
  password: string;
  confirm: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const name = values.name.trim();
  if (!name) errors.name = ['Enter your name.'];
  else if (name.length > MAX_NAME_LENGTH) errors.name = ['Use at most 200 characters.'];

  const emailError = validateEmail(values.email);
  if (emailError) errors.email = [emailError];

  if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = [`Use at least ${MIN_PASSWORD_LENGTH} characters.`];
  } else if (values.password.length > MAX_PASSWORD_LENGTH) {
    errors.password = [`Use at most ${MAX_PASSWORD_LENGTH} characters.`];
  } else if (values.confirm !== values.password) {
    errors.confirm = ['Passwords do not match.'];
  }
  return errors;
}

/**
 * Request an account (`/signup`, REQ-AUTH-03): name, email and password. The new
 * account is pending until an admin approves it; the success message says so and
 * is the same whether or not the email was already registered.
 */
export function SignupForm() {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const errors = validateSignup({ name, email, password, confirm });
    setFormError(null);
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;

    startTransition(async () => {
      const result = await signUpWithPassword({ name, email, password });
      if (result.ok) {
        setSent(true);
        return;
      }
      setFieldErrors(result.error.fieldErrors ?? {});
      setFormError(result.error.fieldErrors ? null : result.error.message);
    });
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p role="status" className="text-sm">
          {SIGNUP_SENT_MESSAGE}
        </p>
        <p className="text-center text-sm">
          <Link href="/login" className={linkClass}>
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <FormAlert message={formError} />
      <AuthField
        label="Name"
        name="name"
        autoComplete="name"
        required
        maxLength={MAX_NAME_LENGTH}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={fieldErrors.name?.[0]}
        readOnly={pending}
      />
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
        autoComplete="new-password"
        required
        minLength={MIN_PASSWORD_LENGTH}
        maxLength={MAX_PASSWORD_LENGTH}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password?.[0]}
        readOnly={pending}
      />
      <AuthField
        label="Confirm password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={fieldErrors.confirm?.[0]}
        readOnly={pending}
      />
      {/* aria-disabled (not disabled) keeps focus on the button while pending. */}
      <Button
        type="submit"
        size="lg"
        className="w-full aria-disabled:opacity-50"
        aria-disabled={pending || undefined}
      >
        {pending ? 'Sending request…' : 'Request access'}
      </Button>
      <p className="text-center text-sm">
        Already have an account?{' '}
        <Link href="/login" className={linkClass}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
