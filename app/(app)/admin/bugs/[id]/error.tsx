'use client';

import { BugsError } from '@/features/bugs/ui/RouteStates';

export default function BugsRouteError({ reset }: { error: Error; reset(): void }) {
  return (
    <BugsError
      title="Couldn't load the bug report"
      reset={reset}
      backHref="/admin/bugs"
      backLabel="All bug reports"
    />
  );
}
