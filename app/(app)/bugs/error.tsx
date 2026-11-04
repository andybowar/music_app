'use client';

import { BugsError } from '@/features/bugs/ui/RouteStates';

export default function BugsRouteError({ reset }: { error: Error; reset(): void }) {
  return (
    <BugsError
      title="Couldn't load your bug reports"
      reset={reset}
      backHref="/library"
      backLabel="Back to the library"
    />
  );
}
