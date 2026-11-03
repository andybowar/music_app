import 'server-only';

import { unstable_rethrow } from 'next/navigation';

import { getBranchActivity, type BranchActivity } from '@/features/branches/server';
import { readCurrentListId } from '@/features/lists/server/currentList';
import { getList, listLists } from '@/features/lists/server/lists';
import { reportError } from '@/lib/log';
import { can } from '@/lib/permissions';
import type { AppUser, List, ListDetail } from '@/types/domain';

export const BRANCHES_PATH = '/branches';

export const ACTIVITY_ERROR = 'Branch activity couldn’t be loaded. Please try again.';

export interface BranchesData {
  /** One entry per branch, or `null` when the activity read failed (`error` says so). */
  activity: BranchActivity[] | null;
  error: string | null;
  /** Lists the user can add songs to (Add-to-List "Existing"). Empty when the read failed. */
  lists: List[];
  /** The session's current list, when the cookie names one the user can still read. */
  currentList: List | null;
}

/** A `ListDetail` without its items: the `List` shape the add menu takes. */
function toList({ items: _items, ...list }: ListDetail): List {
  return list;
}

async function loadCurrentList(): Promise<List | null> {
  const id = await readCurrentListId();
  if (!id) return null;
  const detail = await getList(id);
  return detail ? toList(detail) : null;
}

/**
 * Everything the "Other branches" page shows (BR-02; REQ-BR-01): the per-branch activity plus
 * what the rows' Add-to-List menu needs. Reads run in parallel; a failure in the activity read
 * becomes the view's error state, a failure in the list reads only empties the add menu.
 */
export async function loadBranches(user: AppUser): Promise<BranchesData> {
  const [activity, lists, current] = await Promise.allSettled([
    getBranchActivity(),
    listLists({ scope: 'branch' }),
    loadCurrentList(),
  ]);

  const data: BranchesData = { activity: null, error: null, lists: [], currentList: null };

  if (activity.status === 'fulfilled') {
    data.activity = activity.value;
  } else {
    unstable_rethrow(activity.reason);
    reportError(activity.reason, { handler: 'BranchesPage', step: 'getBranchActivity' });
    data.error = ACTIVITY_ERROR;
  }

  if (lists.status === 'fulfilled') {
    data.lists = lists.value.filter((list) => can(user, 'list:write', { list }));
  } else {
    unstable_rethrow(lists.reason);
    reportError(lists.reason, { handler: 'BranchesPage', step: 'listLists' });
  }

  if (current.status === 'fulfilled') {
    data.currentList = current.value;
  } else {
    unstable_rethrow(current.reason);
    reportError(current.reason, { handler: 'BranchesPage', step: 'currentList' });
  }

  return data;
}
