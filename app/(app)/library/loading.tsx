import { Skeleton } from '@/components/ui/skeleton';

export default function LibraryLoading() {
  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-3 py-4 sm:px-4"
      aria-busy="true"
    >
      <span className="sr-only" role="status">
        Loading songs…
      </span>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-9 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28" />
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="h-5 w-20" />
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}
