# CR DB-05 · Music leaders can't soft-delete same-branch setlists they don't own

**Status:** proposed (not approved).

## Problem

`contracts/permissions.md` gives `music_leader` `list:write` (rename, items, overrides, reorder, **delete**) on any setlist in their own branch, not only ones they own. `can()` (`lib/permissions.ts`) implements this correctly.

RLS doesn't fully match. In `db/migrations/0003_rls.sql`:

- `lists_update` allows a music leader to update a same-branch setlist (USING and WITH CHECK both have the `type = 'setlist' and app_user_role() = 'music_leader' and branch_id = app_user_branch()` branch).
- `lists_select` only shows a non-owner a setlist while `deleted_at is null`:

  ```sql
  and (owner_id = (select auth.uid()) or (type = 'setlist' and deleted_at is null))
  ```

When an UPDATE reads the table (it has a `WHERE`, or `RETURNING`), Postgres also checks the **new** row against the SELECT policy. After `set deleted_at = now()`, a non-owner can no longer see the row, so the update fails with "new row violates row-level security policy". Rename, item edits and hard delete work. Only the soft delete fails.

Found by DB-05 in CI (`tests/db/rls.test.ts`, run 41096990599):

```
approved music_leader > list:write on another member's setlist (same branch)
-   "soft delete": true,
+   "soft delete": false,
```

The same rule also stops a music leader from restoring a soft-deleted same-branch setlist they don't own (setting `deleted_at` back to null), because USING needs the old row to be visible. No current task restores lists, but any future restore or undo flow would hit this.

Admins are unaffected (`app_role_at_least('admin')` sees everything). Owners are unaffected (`owner_id = auth.uid()`).

## Proposed change: new migration `db/migrations/0005_lists_select_leader.sql`

Don't edit 0003. Add a migration that recreates `lists_select` so a music leader can see every setlist they're allowed to write, including soft-deleted ones. This mirrors the leader branch of `lists_update`:

```sql
drop policy if exists lists_select on public.lists;
create policy lists_select on public.lists for select to authenticated
  using (
    (select public.app_role_at_least('admin'))
    or (
      (select public.app_user_role()) is not null
      and (owner_id = (select auth.uid()) or (type = 'setlist' and deleted_at is null))
    )
    or (
      type = 'setlist'
      and (select public.app_user_role()) = 'music_leader'
      and branch_id = (select public.app_user_branch())
    )
  );
```

Plus the matching drizzle journal entry under `db/migrations/meta/`.

Side effect: a music leader's raw `select` now also returns soft-deleted setlists from their branch. List read helpers must already filter `deleted_at is null`, because owners and admins can see their own soft-deleted lists today, so nothing user-facing should change. If that's not acceptable, the alternative is a `security definer` function `soft_delete_list(id)` that checks `can`-equivalent rules. That's more code and a second path to keep in step.

## Affects

- **New migration task (CR-approved, per AGENTS.md §3 `db/migrations/` rule)**: adds `0005_lists_select_leader.sql`.
- **DB-05** (`tests/db/rls.test.ts`): the "approved music_leader > list:write on another member's setlist (same branch)" case is `test.fails` with a reference to this CR. Remove that marker in the same PR as the migration.
- **LIST-01** (`features/lists/server/lists.ts`): no code change. A music leader's delete on a same-branch setlist they don't own starts succeeding, as `can()` already says it should.
- No contract change: `contracts/permissions.md` already says this is allowed.
