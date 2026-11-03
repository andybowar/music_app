import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { redirect, unstable_rethrow } from 'next/navigation';
import type { ReactNode } from 'react';

import { UserMenu } from '@/components/NavBar';
import { branches } from '@/db/schema';
import { readCurrentListId } from '@/features/lists/server/currentList';
import { addListItem, removeListItem } from '@/features/lists/server/items';
import { createList, getList, listLists } from '@/features/lists/server/lists';
import { ListActionsProvider } from '@/features/lists/ui/AddToListAction';
import { CurrentListProvider } from '@/features/lists/ui/CurrentList';
import { NavListActions } from '@/features/lists/ui/NavListActions';
import { requirePageUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { reportError } from '@/lib/log';
import { can } from '@/lib/permissions';
import { createServerSupabase } from '@/lib/supabase/server';
import type { AppUser, List } from '@/types/domain';

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

/**
 * The session's current list (cookie, LIST-04) and the lists the user may add songs to
 * (LIST-09). A failure only costs the add-to options, never the shell.
 */
async function loadListState(user: AppUser): Promise<{ current: List | null; lists: List[] }> {
  try {
    const [currentId, all] = await Promise.all([
      readCurrentListId(),
      listLists({ scope: 'branch', upcomingFirst: true }),
    ]);
    const detail = currentId ? await getList(currentId) : null;
    let current: List | null = null;
    if (detail) {
      // The provider only needs the list itself, not its resolved items.
      const { items: _items, ...list } = detail;
      current = list;
    }
    return { current, lists: all.filter((list) => can(user, 'list:write', { list })) };
  } catch (e) {
    unstable_rethrow(e);
    reportError(e, { where: '(app)/layout loadListState' });
    return { current: null, lists: [] };
  }
}

// Placeholder until SHR-04 (ShareDialog) replaces it. A server action because a server layout
// cannot pass a plain function to a client component.
async function sharePlaceholder(): Promise<void> {
  'use server';
}

/**
 * Shell for every signed-in page (contracts/ui.md: `app/(app)/…` = shell + `requireUser`).
 *
 * `requirePageUser` (AUTH-04) is the page form of `requireUser`: no usable session (signed out,
 * no profile, disabled) → `/login`; pending/rejected → `/account-status`. `middleware.ts` already
 * enforces the same on every non-public route; this is defence in depth.
 * See agent-spec/change-requests/AUTH-04-layout-require-user.md.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requirePageUser();
  const [branchName, listState] = await Promise.all([
    loadBranchName(user.branchId),
    loadListState(user),
  ]);

  return (
    <CurrentListProvider initial={listState.current}>
      <ListActionsProvider
        lists={listState.lists}
        createList={createList}
        addListItem={addListItem}
        removeListItem={removeListItem}
      >
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
                <NavListActions onShare={sharePlaceholder} canAddSong={can(user, 'song:write')} />
              </div>
              <UserMenu
                name={user.name}
                email={user.email}
                branchName={branchName}
                signOut={signOut}
              />
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
      </ListActionsProvider>
    </CurrentListProvider>
  );
}
