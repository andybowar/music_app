'use client';

import { RequestsError } from '@/features/admin/backlog/ui/RouteStates';

export default function RequestsRouteError({ reset }: { error: Error; reset(): void }) {
  return <RequestsError title="Couldn't load the request" reset={reset} />;
}
