import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { NavBar, UserMenu } from '@/components/NavBar';
import { branches, users } from '@/db/schema';
import { db } from '@/lib/db';
import { createServerSupabase } from '@/lib/supabase/server';
import type { AppUser, ListType } from '@/types/domain';

/**
 * Shell for every signed-in page (contracts/ui.md: `app/(app)/…` = shell + `requireUser`).
 *
 * TEMPORARY `requireUser`: `@/lib/auth` (AUTH-04) is not on main yet, so this local stand-in
 * follows the contracted behaviour (signed-in, provisioned, not disabled → AppUser; otherwise
 * no access). When AUTH-04 merges, delete it and `import { requireUser } from '@/lib/auth'`.
 * See agent-spec/change-requests/UI-02-require-user.md.
 */
async function requireUser(): Promise<AppUser> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect('/login');

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      branchId: users.branchId,
      role: users.role,
      authProvider: users.authProvider,
      disabledAt: users.disabledAt,
      accessStatus: users.accessStatus,
    })
    .from(users)
    .where(eq(users.id, data.user.id))
    .limit(1);
  if (!row || row.disabledAt) redirect('/login');

  return { ...row, disabledAt: null };
}

async function loadBranchName(branchId: string | null): Promise<string | null> {
  if (!branchId) return null;
  const [row] = await db
    .select({ name: branches.name })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  return row?.name ?? null;
}

async function signOut(): Promise<void> {
  'use server';
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect('/login');
}

// Placeholders until LIST-09 (create dialogs, CurrentListProvider) and SHR-04 (ShareDialog)
// replace them. Server actions because a server layout cannot pass plain functions to a
// client component.
async function createListPlaceholder(_type: ListType): Promise<void> {
  'use server';
}

async function sharePlaceholder(): Promise<void> {
  'use server';
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const branchName = await loadBranchName(user.branchId);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-[3px] focus:ring-ring"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 xl:h-16">
          <Link
            href="/library"
            className="shrink-0 rounded-md text-base font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
          >
            Worship Library
          </Link>
          <div className="flex min-w-0 flex-1 justify-center">
            <NavBar
              currentList={null}
              onCreate={createListPlaceholder}
              onShare={sharePlaceholder}
            />
          </div>
          <UserMenu name={user.name} email={user.email} branchName={branchName} signOut={signOut} />
        </div>
      </header>
      {/* Bottom padding keeps content clear of the fixed mobile tab bar (h-14 + safe area). */}
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] outline-none xl:pb-0"
      >
        {children}
      </main>
    </div>
  );
}
