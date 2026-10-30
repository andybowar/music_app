-- DB-07 · User access status (approval) (contracts/schema.md, contracts/permissions.md)
--
-- REQ-AUTH-03: anyone can request an account; new accounts start 'pending' and
--   see no data until an admin approves them. Invited accounts are approved
--   when created (the inviting code sets access_status = 'approved').
-- REQ-AUTH-08: admins approve or reject pending accounts; pending and rejected
--   users can read only their own users row (for the account-status page).
--
-- Every user that exists before this migration is backfilled 'approved'.
--
-- Enforcement: app_user_role() and app_user_branch() now return null unless
-- the caller is approved (and not disabled). Every DB-03 policy goes through
-- these helpers, so pending and rejected users get nothing from any table,
-- exactly like disabled users. users_select is the one exception: it lets any
-- non-disabled user read their own row without going through the helpers.

create type public.access_status as enum ('pending', 'approved', 'rejected');
--> statement-breakpoint

-- Add with default 'approved' so existing rows are backfilled, then switch the
-- default to 'pending' for every row created from now on.
alter table public.users
  add column access_status public.access_status not null default 'approved',
  add column access_decided_by uuid,
  add column access_decided_at timestamp with time zone;
--> statement-breakpoint
alter table public.users alter column access_status set default 'pending';
--> statement-breakpoint
alter table public.users
  add constraint users_access_decided_by_fkey
  foreign key (access_decided_by) references public.users (id)
  on delete no action on update no action;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- RLS helpers (contracts/permissions.md "RLS helper functions"). Same
-- signatures as 0003, so existing grants and dependent policies are kept.
-- ---------------------------------------------------------------------------
create or replace function public.app_user_role()
returns public.role
language sql
stable
security definer
set search_path = ''
as $fn$
  select u.role from public.users u
  where u.id = auth.uid() and u.disabled_at is null and u.access_status = 'approved'
$fn$;
--> statement-breakpoint

create or replace function public.app_user_branch()
returns uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select u.branch_id from public.users u
  where u.id = auth.uid() and u.disabled_at is null and u.access_status = 'approved'
$fn$;
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- users: any non-disabled user (approved, pending or rejected) reads their own
-- row; admin:users reads all. Checks the row's own columns rather than
-- app_user_role(), which is null for pending and rejected users.
-- ---------------------------------------------------------------------------
drop policy if exists users_select on public.users;
--> statement-breakpoint
create policy users_select on public.users for select to authenticated
  using (
    (id = (select auth.uid()) and disabled_at is null)
    or (select public.app_role_at_least('admin'))
  );
