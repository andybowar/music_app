'use client';

import { useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';

import { AccountStatus } from '@/features/auth/ui/AccountStatus';
import { SignupForm, validateSignup } from '@/features/auth/ui/SignupForm';
import { users } from '@/fixtures';
import { ACCESS_STATUSES, type AccessStatus } from '@/types/domain';

const person = users.find((u) => u.accessStatus === 'pending') ?? users[0]!;

/**
 * Body of `/dev/auth-signup`: AUTH-07's SignupForm and AccountStatus.
 *
 * Neither component takes its server action as a prop (SignupForm calls `signUpWithPassword`,
 * AccountStatus calls `signOut`), so the gallery stubs them from outside: a capture-phase
 * handler stops a valid signup submit, and the sign-out click, before the component's own
 * handler runs. Client-side validation still runs for invalid input. The pending, success and
 * server-error states can't be reached here without changing the components; their unit tests
 * cover them, and `/signup` shows them against a local stack.
 */
export function AuthSignupGallery() {
  const [status, setStatus] = useState<AccessStatus>('pending');
  const [log, setLog] = useState<string[]>([]);
  const record = (entry: string) => setLog((l) => [entry, ...l].slice(0, 8));

  function stubSignup(event: FormEvent<HTMLDivElement>) {
    const form = event.target as HTMLFormElement;
    const data = new FormData(form);
    const values = {
      name: String(data.get('name') ?? ''),
      email: String(data.get('email') ?? ''),
      password: String(data.get('password') ?? ''),
      confirm: String(data.get('confirm') ?? ''),
    };
    const errors = validateSignup(values);
    // Invalid input: let the form show its own validation errors.
    if (Object.values(errors).some(Boolean)) return;
    event.preventDefault();
    event.stopPropagation();
    record(`signUpWithPassword({ name: ${values.name.trim()}, email: ${values.email.trim()} })`);
  }

  function stubSignOut(status: string) {
    return (event: MouseEvent<HTMLDivElement>) => {
      const button = (event.target as HTMLElement).closest('button');
      if (!button || button.type !== 'button') return;
      event.preventDefault();
      event.stopPropagation();
      record(`signOut() from the ${status} state`);
    };
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 p-4">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">Sign-up and account status</h1>
        <p className="text-sm text-muted-foreground">
          AUTH-07 · server actions are stubbed: a valid submit and “Sign out” only log here.
        </p>
      </header>

      <Card id="signup" title="SignupForm · empty (submit it empty to see validation)">
        <div onSubmitCapture={stubSignup}>
          <SignupForm />
        </div>
      </Card>

      {/* One at a time: AccountStatus uses a fixed heading id, so two on a page would clash. */}
      <Card id="account-status" title={`AccountStatus · ${status}`}>
        <fieldset className="mb-4 flex flex-wrap gap-4 text-sm">
          <legend className="mb-1 text-muted-foreground">Access status</legend>
          {ACCESS_STATUSES.map((s) => (
            <label key={s} className="flex min-h-tap items-center gap-2">
              <input
                type="radio"
                name="access-status"
                value={s}
                checked={status === s}
                onChange={() => setStatus(s)}
              />
              {s}
            </label>
          ))}
        </fieldset>
        <div onClickCapture={stubSignOut(status)}>
          <AccountStatus status={status} name={person.name} email={person.email} />
        </div>
      </Card>

      <section className="grid gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Action log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions yet.</p>
        ) : (
          <ul className="grid gap-1 text-sm" data-testid="action-log">
            {log.map((entry, i) => (
              <li key={i}>{entry}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function Card({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-sm font-medium text-muted-foreground">
        {title}
      </h2>
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        {children}
      </div>
    </section>
  );
}
