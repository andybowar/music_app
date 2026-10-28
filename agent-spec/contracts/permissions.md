# Contract: Permissions

**Status: FROZEN.** Implemented twice, and both must agree:
- `lib/permissions.ts` (task `AUTH-05`): `can(user, action, ctx?) => boolean`, used by every server action.
- RLS policies (task `DB-03`): defense in depth. Tests in `DB-05` assert parity.

Disabled users (`disabled_at` not null) can do nothing. Unauthenticated users can do nothing except read a valid share (via server-side service role, `SHR-01`).

## Actions

| Action | member | contributor | music_leader | admin | Notes |
|---|:-:|:-:|:-:|:-:|---|
| `song:read` | ✓ | ✓ | ✓ | ✓ | Excludes soft-deleted songs |
| `song:write` (create/update tags, lyrics, keys, composers) | | ✓ | ✓ | ✓ | |
| `song:delete` (soft) | | | | ✓ | |
| `song:set_added_by` | | | | ✓ | Otherwise auto from creator's branch |
| `resource:read` (signed URL) | ✓ | ✓ | ✓ | ✓ | |
| `resource:write` (upload/link/delete) | | ✓ | ✓ | ✓ | |
| `theme:create` | | ✓ | ✓ | ✓ | |
| `theme:merge` / `theme:synonyms` | | | ✓ | ✓ | |
| `composer:create` | | ✓ | ✓ | ✓ | |
| `composer:merge` / set `pop_member` | | | ✓ | ✓ | |
| `usage:write` | | ✓ | ✓ | ✓ | |
| `list:create` | ✓ | ✓ | ✓ | ✓ | |
| `list:read` setlist | ✓ | ✓ | ✓ | ✓ | All setlists, any branch |
| `list:read` playlist | owner | owner | owner | ✓ | |
| `list:write` (rename, items, overrides, reorder, delete) | owner | owner | owner, or same-branch setlist | ✓ | `ctx = { list }` |
| `share:create` / `share:revoke` | if `list:write` | ← | ← | ✓ | |
| `audit:read` | | ✓ | ✓ | ✓ | |
| `admin:users` / `admin:branches` / `admin:import` | | | | ✓ | |

## `can()` signature

```ts
export type Action =
  | 'song:read' | 'song:write' | 'song:delete' | 'song:set_added_by'
  | 'resource:read' | 'resource:write'
  | 'theme:create' | 'theme:merge' | 'theme:synonyms'
  | 'composer:create' | 'composer:merge'
  | 'usage:write'
  | 'list:create' | 'list:read' | 'list:write'
  | 'share:create' | 'share:revoke'
  | 'audit:read'
  | 'admin:users' | 'admin:branches' | 'admin:import';

export interface PermCtx { list?: Pick<List, 'type' | 'ownerId' | 'branchId'> }
export function can(user: AppUser | null, action: Action, ctx?: PermCtx): boolean;
export function assertCan(user: AppUser | null, action: Action, ctx?: PermCtx): void; // throws ActionError('FORBIDDEN')
```

## RLS helper functions (DB-03)

```sql
create function app_user_role()   returns role  language sql stable security definer as $$ select role from users where id = auth.uid() and disabled_at is null $$;
create function app_user_branch() returns uuid  language sql stable security definer as $$ select branch_id from users where id = auth.uid() and disabled_at is null $$;
create function app_role_at_least(r role) returns boolean language sql stable as $$ select coalesce(app_user_role() >= r, false) $$;
```
(`role` enum order is member < contributor < music_leader < admin, so `>=` works.)
