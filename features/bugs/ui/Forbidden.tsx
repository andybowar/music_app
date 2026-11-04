/** The 403 body for bug report routes (same wording style as ADM-05's admin pages). */
export function BugsForbidden({ admin = false }: { admin?: boolean }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm font-medium text-muted-foreground">403</p>
      <h1 className="mt-1 text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {admin
          ? 'Only admins can see everyone’s bug reports. You can still see your own under Report a bug.'
          : 'Your account can’t report bugs yet. Ask an admin if you think this is wrong.'}
      </p>
    </div>
  );
}
