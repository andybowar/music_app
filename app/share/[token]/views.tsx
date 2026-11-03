import Link from 'next/link';

const linkClass =
  'mt-4 inline-flex min-h-tap items-center rounded-md text-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring';

/**
 * The one answer for a link that doesn't work: unknown, malformed, revoked, expired or for a
 * deleted list. It says nothing about which, so a token can't be probed.
 */
export function ShareNotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">This link isn&apos;t available</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        The link may be mistyped, or it may have expired or been turned off. Ask the person who
        shared it for a new one.
      </p>
      <Link href="/login" className={linkClass}>
        Members: sign in to the Worship Library
      </Link>
    </main>
  );
}

/** Shown when the shared list couldn't be loaded (database error). */
export function ShareLoadError() {
  return (
    <main role="alert" className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">Couldn&apos;t load this list</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Something went wrong. Please reload the page to try again.
      </p>
    </main>
  );
}
