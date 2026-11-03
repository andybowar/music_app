import Link from 'next/link';

export default function ListNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">List not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It may have been deleted, it may be someone else&apos;s private playlist, or the link is
        wrong.
      </p>
      <Link
        href="/lists?type=setlist"
        className="mt-4 inline-flex min-h-tap items-center rounded-md text-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        Back to setlists
      </Link>
    </div>
  );
}
