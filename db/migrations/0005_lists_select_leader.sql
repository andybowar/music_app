-- DB-08 · Music leaders can soft-delete same-branch setlists (RLS fix)
-- (agent-spec/change-requests/DB-05-leader-soft-delete-setlist.md, contracts/permissions.md)
--
-- contracts/permissions.md gives music_leader list:write (including delete) on
-- any setlist in their own branch. lists_update (0003) already allows it, but
-- lists_select only showed a non-owner a setlist while deleted_at is null. An
-- UPDATE also checks the new row against the SELECT policy, so a leader's
-- `set deleted_at = now()` on someone else's setlist failed, and restoring one
-- (deleted_at back to null) was impossible because the old row was hidden.
--
-- Recreate lists_select with a third branch that mirrors the leader branch of
-- lists_update: a music leader sees every setlist in their branch, including
-- soft-deleted ones. app_user_role() / app_user_branch() return null unless the
-- caller is approved and not disabled (0004), so pending, rejected and disabled
-- users still see nothing. Other branches' setlists and other people's
-- playlists are unchanged.
--
-- Deploy safety: this only widens what a music leader can read (soft-deleted
-- same-branch setlists). List read helpers already filter deleted_at is null,
-- as owners and admins could already see their own soft-deleted lists, so the
-- build still live while this runs behaves the same. Drop and create run in
-- one transaction, so there is no moment without a SELECT policy.

drop policy if exists lists_select on public.lists;
--> statement-breakpoint
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
