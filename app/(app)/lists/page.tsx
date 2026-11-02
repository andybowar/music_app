import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { Suspense } from 'react';
import { z } from 'zod';

import { Toaster } from '@/components/ui/sonner';
import {
  CURRENT_LIST_COOKIE,
  CURRENT_LIST_MAX_AGE_SECONDS,
} from '@/features/lists/currentListCookie';
import { readCurrentListId } from '@/features/lists/server/currentList';
import { createList, getList, listLists, type ListScope } from '@/features/lists/server/lists';
import { ListIndex } from '@/features/lists/ui/ListIndex';
import { ActionError, withAction } from '@/lib/action';
import { requirePageUser, requireUser } from '@/lib/auth';
import { reportError } from '@/lib/log';
import { assertCan } from '@/lib/permissions';
import type { ActionResult, ISODate, List, ListType, UUID } from '@/types/domain';

/**
 * Open Setlist / Open Playlist (LIST-08, REQ-LIST-07): `/lists?type=setlist|playlist`, plus
 * `&scope=mine|branch|all` for setlists (default `branch`: the caller's lists and their branch's).
 * Playlists are private to their owner (REQ-LIST-08), so they always show the caller's own.
 */

// Per-request: the signed-in user, their cookies and today's date.
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const typeParam = z.enum(['setlist', 'playlist']).catch('setlist');
const scopeParam = z.enum(['mine', 'branch', 'all']).catch('branch');

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseParams(params: Record<string, string | string[] | undefined>): {
  type: ListType;
  scope: ListScope;
} {
  const type = typeParam.parse(first(params.type));
  const scope = type === 'playlist' ? 'mine' : scopeParam.parse(first(params.scope));
  return { type, scope };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const { type } = parseParams(await searchParams);
  return { title: type === 'setlist' ? 'Open setlist' : 'Open playlist' };
}

const LOAD_ERROR = 'Please try again.';

/** Make a list the session's current list (REQ-LIST-01): sets the `current_list` cookie. */
const setCurrentListImpl = withAction(async (id: unknown): Promise<null> => {
  const user = await requireUser();
  const listId = z.guid().parse(id);
  // `getList` returns null for lists the caller can't read, so their existence isn't revealed.
  const list = await getList(listId);
  if (!list) throw new ActionError('NOT_FOUND', 'List not found.');
  assertCan(user, 'list:read', { list });

  const store = await cookies();
  // Not httpOnly: `CurrentListProvider` reads and writes the same cookie in the browser.
  store.set(CURRENT_LIST_COOKIE, list.id, {
    path: '/',
    maxAge: CURRENT_LIST_MAX_AGE_SECONDS,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: false,
  });
  return null;
});

async function setCurrentList(list: List): Promise<ActionResult<null>> {
  'use server';
  return setCurrentListImpl(list.id);
}

function todayUTC(): ISODate {
  return new Date().toISOString().slice(0, 10);
}

interface IndexProps {
  type: ListType;
  scope: ListScope;
  currentListId: UUID | null;
  today: ISODate;
}

async function LoadedListIndex({ type, scope, currentListId, today }: IndexProps) {
  let lists: List[] = [];
  let error: string | null = null;
  try {
    lists = await listLists({ type, scope, upcomingFirst: true });
  } catch (e) {
    unstable_rethrow(e);
    reportError(e, { where: 'lists/page', type, scope });
    error = LOAD_ERROR;
  }
  return (
    <ListIndex
      type={type}
      scope={scope}
      lists={lists}
      today={today}
      currentListId={currentListId}
      error={error}
      onSetCurrent={setCurrentList}
      onCreate={createList}
    />
  );
}

export default async function ListsPage({ searchParams }: { searchParams: SearchParams }) {
  const { type, scope } = parseParams(await searchParams);
  // A 'use client' module's helpers are references on the server, so build `next` here.
  await requirePageUser(
    type === 'setlist' ? `/lists?type=setlist&scope=${scope}` : '/lists?type=playlist',
  );
  const currentListId = await readCurrentListId();
  const props: IndexProps = { type, scope, currentListId, today: todayUTC() };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Suspense
        key={`${type}:${scope}`}
        fallback={
          <ListIndex
            {...props}
            lists={[]}
            loading
            onSetCurrent={setCurrentList}
            onCreate={createList}
          />
        }
      >
        <LoadedListIndex {...props} />
      </Suspense>
      <Toaster />
    </div>
  );
}
