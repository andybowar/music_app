import type { ReactNode } from 'react';

/** Centered, shell-less card shared by the sign-in and reset pages. */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-start justify-center bg-background px-4 py-12 sm:items-center">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <p className="mb-1 text-sm font-medium text-muted-foreground">Worship Library</p>
        <h1 className="text-xl font-semibold">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
