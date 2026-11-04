'use client';

import { BugsError } from '@/features/bugs/ui/RouteStates';

export default function BugsRouteError({ reset }: { error: Error; reset(): void }) {
  return (
    <BugsError
      title="Couldn't open the bug report form"
      reset={reset}
      backHref="/bugs"
      backLabel="Your bug reports"
    />
  );
}
