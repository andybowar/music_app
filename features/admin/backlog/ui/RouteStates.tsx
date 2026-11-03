'use client';

import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { REQUESTS_HREF } from './RequestList';

/** Loading skeleton shared by the /admin/requests routes. */
export function RequestsLoading({ label }: { label: string }) {
  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6" aria-busy="true">
      <span className="sr-only" role="status">
        {label}
      </span>
      <Skeleton className="h-7 w-48" />
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/** Error boundary body shared by the /admin/requests routes. */
export function RequestsError({ title, reset }: { title: string; reset(): void }) {
  return (
    <div role="alert" className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Something went wrong. Please try again.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="min-h-tap" onClick={reset}>
          Try again
        </Button>
        <Button asChild variant="outline" className="min-h-tap">
          <Link href={REQUESTS_HREF}>All requests</Link>
        </Button>
      </div>
    </div>
  );
}

/** Inline error for one /admin dashboard section whose data failed to load. */
export function SectionError({ what }: { what: string }) {
  return (
    <p role="alert" className="rounded-md border border-destructive p-3 text-sm">
      Couldn&apos;t load {what}. Reload the page to try again.
    </p>
  );
}
