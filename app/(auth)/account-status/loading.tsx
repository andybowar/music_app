import { AuthShell } from '../login/AuthShell';

/** Shown while the signed-in user's status is looked up. */
export default function AccountStatusLoading() {
  return (
    <AuthShell title="Account status">
      <div role="status" aria-live="polite" className="space-y-3">
        <span className="sr-only">Checking your account…</span>
        <div aria-hidden="true" className="h-16 animate-pulse rounded-md bg-muted" />
        <div aria-hidden="true" className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div aria-hidden="true" className="h-10 animate-pulse rounded-md bg-muted" />
      </div>
    </AuthShell>
  );
}
