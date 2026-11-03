'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Segment error boundary for the song page (LIB-18; CR LIB-18-song-page-paths). Same look as
 * `SongPageError`, but retries in place: re-fetch the server components, then re-render the
 * segment. `page.tsx` already handles a failed `getSong` itself; this catches anything else
 * thrown while rendering. `/songs/[id]/edit` has its own `error.tsx` (LIB-17), which wins there.
 */
export default function SongError({
  reset,
}: {
  error: Error & { digest?: string };
  reset(): void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function retry() {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div role="alert" className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">Couldn&apos;t load this song</h1>
      <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Please try again.</p>
      <Button className="mt-4 min-h-tap" onClick={retry} disabled={pending}>
        Try again
      </Button>
    </div>
  );
}
