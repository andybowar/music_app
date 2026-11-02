import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div
      className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 py-4 sm:px-4 sm:py-6"
      aria-busy="true"
    >
      <span className="sr-only" role="status">
        Loading quick theme lookup…
      </span>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-16 w-full rounded-lg" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-lg" />
      ))}
    </div>
  );
}
