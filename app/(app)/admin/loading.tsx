import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto grid max-w-3xl gap-4 px-4 py-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading admin…
      </span>
      <Skeleton className="h-7 w-24" />
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
