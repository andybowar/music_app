import Link from 'next/link';

const linkClass =
  'mt-4 inline-flex min-h-tap items-center rounded-md text-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring';

/** Shown when the list couldn't be loaded (database error). */
export function ListLoadError({ retryHref }: { retryHref: string }) {
  return (
    <div role="alert" className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">Couldn&apos;t load this list</h1>
      <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Please try again.</p>
      <Link href={retryHref} className={linkClass}>
        Try again
      </Link>
    </div>
  );
}
