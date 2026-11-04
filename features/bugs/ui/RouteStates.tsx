'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';

/** Error boundary body shared by the /bugs and /admin/bugs routes. */
export function BugsError({
  title,
  reset,
  backHref,
  backLabel,
}: {
  title: string;
  reset(): void;
  backHref: string;
  backLabel: string;
}) {
  return (
    <div role="alert" className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Please try again.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="min-h-tap" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline" className="min-h-tap">
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
