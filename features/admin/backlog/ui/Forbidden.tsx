/** The 403 body for backlog routes (same wording style as ADM-05's admin pages). */
export function BacklogForbidden() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-sm font-medium text-muted-foreground">403</p>
      <h1 className="mt-1 text-xl font-semibold">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Only admins can see enhancement requests. Ask an admin if you need a different role.
      </p>
    </div>
  );
}
