'use client';

import type { FormEvent } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { confirmPasswordReset, requestPasswordReset } from '@/features/auth/actions';

import { AuthField, type FieldErrors, FormAlert, validateEmail } from './LoginForm';

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;

/** Same message whether or not the email has an account (no user enumeration). */
export const RESET_SENT_MESSAGE =
  "If an account exists for that email, we've sent a link to reset your password. Check your inbox.";

const linkClass =
  'inline-flex min-h-10 items-center text-primary underline underline-offset-4 hover:decoration-2';

function SubmitButton({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    // aria-disabled (not disabled) keeps focus on the button while pending.
    <Button
      type="submit"
      size="lg"
      className="w-full aria-disabled:opacity-50"
      aria-disabled={pending || undefined}
    >
      {pending ? busy : idle}
    </Button>
  );
}

/** Step 1 (`/reset`): ask for an email and send the reset link. */
export function ResetRequestForm() {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const emailError = validateEmail(email);
    setFormError(null);
    setFieldErrors({ email: emailError ? [emailError] : undefined });
    if (emailError) return;

    startTransition(async () => {
      const result = await requestPasswordReset(email);
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
          {RESET_SENT_MESSAGE}
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
      <SubmitButton pending={pending} idle="Send reset link" busy="Sending…" />
      <p className="text-center text-sm">
        <Link href="/login" className={linkClass}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}

/**
 * Step 2 (`/reset/confirm`): choose a new password. `token` is the code from the
 * reset link. On success the user is signed in and lands on `/library`.
 */
export function ResetConfirmForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const errors: FieldErrors = {};
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = [`Use at least ${MIN_PASSWORD_LENGTH} characters.`];
    } else if (password.length > MAX_PASSWORD_LENGTH) {
      errors.password = [`Use at most ${MAX_PASSWORD_LENGTH} characters.`];
    }
    if (!errors.password && confirm !== password) errors.confirm = ['Passwords do not match.'];
    setFormError(null);
    setFieldErrors(errors);
    if (errors.password || errors.confirm) return;

    startTransition(async () => {
      const result = await confirmPasswordReset(token, password);
      if (result.ok) {
        router.replace('/library');
        router.refresh();
        return;
      }
      if (result.error.code === 'UNAUTHENTICATED') setLinkInvalid(true);
      setFieldErrors(result.error.fieldErrors ?? {});
      setFormError(result.error.fieldErrors ? null : result.error.message);
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} aria-busy={pending} className="space-y-4">
      <FormAlert message={formError} />
      {linkInvalid ? (
        <p className="text-center text-sm">
          <Link href="/reset" className={linkClass}>
            Request a new reset link
          </Link>
        </p>
      ) : null}
      <AuthField
        label="New password"
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
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={fieldErrors.confirm?.[0]}
        readOnly={pending}
      />
      <SubmitButton pending={pending} idle="Set new password" busy="Saving…" />
    </form>
  );
}
