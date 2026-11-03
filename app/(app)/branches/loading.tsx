import { Skeleton } from '@/components/ui/skeleton';

export default function BranchesLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-3 py-4 sm:px-4"
      aria-busy="true"
    >
      <span className="sr-only" role="status">
        Loading branch activity…
      </span>
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      {Array.from({ length: 2 }, (_, card) => (
        <div key={card} className="flex flex-col gap-2 rounded-lg border p-3 sm:p-4">
          <Skeleton className="h-6 w-40" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}
