'use client';

import { Button } from '@/components/ui/button';

export default function EditSongError({ reset }: { error: Error; reset(): void }) {
  return (
    <div role="alert" className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">Couldn&apos;t load this song</h1>
      <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Please try again.</p>
      <Button className="mt-4" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
