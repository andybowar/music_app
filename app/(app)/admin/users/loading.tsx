import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="mx-auto grid max-w-5xl gap-4 px-4 py-6" aria-busy="true">
      <span className="sr-only" role="status">
        Loading users…
      </span>
      <Skeleton className="h-7 w-24" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-64" />
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}
