// Pure permission matrix (contracts/permissions.md). Shared by server actions and the
// RLS parity tests (DB-05), so no `server-only`, no I/O.
import type { AppUser, List, Role } from '@/types/domain';

export type Action =
  | 'song:read'
  | 'song:write'
  | 'song:delete'
  | 'song:set_added_by'
  | 'resource:read'
  | 'resource:write'
  | 'theme:create'
  | 'theme:merge'
  | 'theme:synonyms'
  | 'composer:create'
  | 'composer:merge'
  | 'usage:write'
  | 'list:create'
  | 'list:read'
  | 'list:write'
  | 'share:create'
  | 'share:revoke'
  | 'audit:read'
  | 'admin:users'
  | 'admin:branches'
  | 'admin:import';

export interface PermCtx {
  list?: Pick<List, 'type' | 'ownerId' | 'branchId'>;
}

/** Minimum role for actions that depend on role alone. */
const MIN_ROLE = {
  'song:read': 'member',
  'song:write': 'contributor',
  'song:delete': 'admin',
  'song:set_added_by': 'admin',
  'resource:read': 'member',
  'resource:write': 'contributor',
  'theme:create': 'contributor',
  'theme:merge': 'music_leader',
  'theme:synonyms': 'music_leader',
  'composer:create': 'contributor',
  'composer:merge': 'music_leader',
  'usage:write': 'contributor',
  'list:create': 'member',
  'audit:read': 'contributor',
  'admin:users': 'admin',
  'admin:branches': 'admin',
  'admin:import': 'admin',
} as const satisfies Record<Exclude<Action, ListScopedAction>, Role>;

type ListScopedAction = 'list:read' | 'list:write' | 'share:create' | 'share:revoke';

/** Mirrors the Postgres `role` enum order: member < contributor < music_leader < admin. */
const RANK: Record<Role, number> = { member: 0, contributor: 1, music_leader: 2, admin: 3 };

function canWriteList(user: AppUser, list: NonNullable<PermCtx['list']>): boolean {
  if (list.ownerId === user.id) return true;
  return (
    user.role === 'music_leader' &&
    list.type === 'setlist' &&
    user.branchId !== null &&
    list.branchId === user.branchId
  );
}

/**
 * Whether `user` may perform `action`. Null (unauthenticated) and disabled users can do
 * nothing. List-scoped actions (`list:read`, `list:write`, `share:*`) need `ctx.list` for
 * every role except admin; without it they are denied.
 */
export function can(user: AppUser | null, action: Action, ctx?: PermCtx): boolean {
  if (user === null || user.disabledAt !== null) return false;
  if (user.role === 'admin') return true;

  switch (action) {
    case 'list:read': {
      const list = ctx?.list;
      if (!list) return false;
      return list.type === 'setlist' || list.ownerId === user.id;
    }
    case 'list:write':
    case 'share:create':
    case 'share:revoke':
      return ctx?.list ? canWriteList(user, ctx.list) : false;
    default:
      return RANK[user.role] >= RANK[MIN_ROLE[action]];
  }
}

/**
 * Throws when `can()` is false. The error is an `Error` named `ActionError` carrying
 * `code: 'FORBIDDEN'`, so DB-06's `withAction` can map it to an `ActionResult` failure
 * (lib/action.ts does not exist yet, so its class cannot be imported here).
 */
export function assertCan(user: AppUser | null, action: Action, ctx?: PermCtx): void {
  if (can(user, action, ctx)) return;
  const error = new Error(`You do not have permission to do this (${action}).`) as Error & {
    code: 'FORBIDDEN';
  };
  error.name = 'ActionError';
  error.code = 'FORBIDDEN';
  throw error;
}
