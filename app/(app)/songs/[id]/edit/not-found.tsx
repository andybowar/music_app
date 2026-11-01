import Link from 'next/link';

export default function SongNotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">Song not found</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It may have been deleted, or the link is wrong.
      </p>
      <Link
        href="/library"
        className="mt-4 inline-block rounded-md text-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        Back to the library
      </Link>
    </div>
  );
}
