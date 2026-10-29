-- DB-03 · RLS policies (contracts/permissions.md)
--
-- REQ-AUTH-07: the permission matrix is enforced in Postgres RLS as well as in
--   lib/permissions.ts (`can()`). DB-05 asserts parity.
-- REQ-LIST-08: setlists are readable by every active user; playlists only by
--   their owner (and admins). Public share links are read via the service role.
-- REQ-NF-05: RLS is defense in depth. Server code connects as `postgres`
--   (DATABASE_URL) or `service_role`, both BYPASSRLS, and authorizes with
--   `assertCan` first. These policies bind the `authenticated` and `anon`
--   roles, i.e. any request made with a user's JWT through PostgREST/Storage.
--
-- Rules shared by every policy:
--   * Policies are `to authenticated` only, so `anon` gets zero rows everywhere.
--   * A disabled user (users.disabled_at set) has app_user_role() = null, so
--     every policy is false and they see and change nothing.
--   * Helper calls are wrapped in `(select ...)` so Postgres evaluates them
--     once per statement (initplan) instead of once per row.
--
-- Every function pins `search_path = ''`, so everything is schema-qualified.
-- Statements are re-runnable (create or replace / drop ... if exists).

-- ---------------------------------------------------------------------------
-- Helper functions (contracts/permissions.md "RLS helper functions").
-- SECURITY DEFINER so they can read public.users without recursing into its
-- own RLS policies.
-- ---------------------------------------------------------------------------
create or replace function public.app_user_role()
returns public.role
language sql
stable
security definer
set search_path = ''
as $fn$
  select u.role from public.users u where u.id = auth.uid() and u.disabled_at is null
$fn$;

create or replace function public.app_user_branch()
returns uuid
language sql
stable
security definer
set search_path = ''
as $fn$
  select u.branch_id from public.users u where u.id = auth.uid() and u.disabled_at is null
$fn$;

-- `role` enum order is member < contributor < music_leader < admin, so >= works.
create or replace function public.app_role_at_least(r public.role)
returns boolean
language sql
stable
set search_path = ''
as $fn$
  select coalesce(public.app_user_role() operator(pg_catalog.>=) r, false)
$fn$;

-- Policies only bind `authenticated`. Keep the helpers off the anon API.
revoke execute on function public.app_user_role() from public, anon;
revoke execute on function public.app_user_branch() from public, anon;
revoke execute on function public.app_role_at_least(public.role) from public, anon;
grant execute on function public.app_user_role() to authenticated, service_role;
grant execute on function public.app_user_branch() to authenticated, service_role;
grant execute on function public.app_role_at_least(public.role) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- song:set_added_by is admin-only. The insert policy pins added_by_branch_id
-- to the creator's branch; RLS can't compare old and new rows, so a trigger
-- stops non-admins changing it on update. It only applies to the API roles,
-- so server code (postgres / service_role) is unaffected.
-- ---------------------------------------------------------------------------
create or replace function public.songs_guard_added_by()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  if current_user in ('authenticated', 'anon')
     and new.added_by_branch_id is distinct from old.added_by_branch_id
     and not public.app_role_at_least('admin') then
    raise exception 'only admins may change songs.added_by_branch_id'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$fn$;

drop trigger if exists songs_guard_added_by on public.songs;
create trigger songs_guard_added_by
  before update of added_by_branch_id on public.songs
  for each row execute function public.songs_guard_added_by();

-- ---------------------------------------------------------------------------
-- Enable RLS on every table. TRUNCATE ignores RLS, so take it (and the
-- unused TRIGGER / REFERENCES privileges) away from the API roles.
-- ---------------------------------------------------------------------------
alter table public.branches       enable row level security;
alter table public.users          enable row level security;
alter table public.composers      enable row level security;
alter table public.songs          enable row level security;
alter table public.song_composers enable row level security;
alter table public.song_keys      enable row level security;
alter table public.resources      enable row level security;
alter table public.themes         enable row level security;
alter table public.theme_synonyms enable row level security;
alter table public.song_themes    enable row level security;
alter table public.branch_usage   enable row level security;
alter table public.lists          enable row level security;
alter table public.list_items     enable row level security;
alter table public.shares         enable row level security;
alter table public.audit_log      enable row level security;

revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- branches: read by any active user; admin:branches writes.
-- ---------------------------------------------------------------------------
drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches for select to authenticated
  using ((select public.app_user_role()) is not null);

drop policy if exists branches_admin_write on public.branches;
create policy branches_admin_write on public.branches for all to authenticated
  using ((select public.app_role_at_least('admin')))
  with check ((select public.app_role_at_least('admin')));

-- ---------------------------------------------------------------------------
-- users: an active user reads their own row; admin:users reads and writes all.
-- (Owner/actor names for other users are resolved by server code.)
-- ---------------------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (
    (id = (select auth.uid()) and (select public.app_user_role()) is not null)
    or (select public.app_role_at_least('admin'))
  );

drop policy if exists users_admin_write on public.users;
create policy users_admin_write on public.users for all to authenticated
  using ((select public.app_role_at_least('admin')))
  with check ((select public.app_role_at_least('admin')));

-- ---------------------------------------------------------------------------
-- songs: song:read (active users; soft-deleted rows only for admins),
-- song:write (contributor+), song:delete soft = setting deleted_at (admin),
-- song:set_added_by (admin; see trigger above). Hard delete: admin.
-- ---------------------------------------------------------------------------
drop policy if exists songs_select on public.songs;
create policy songs_select on public.songs for select to authenticated
  using (
    ((select public.app_user_role()) is not null and deleted_at is null)
    or (select public.app_role_at_least('admin'))
  );

drop policy if exists songs_insert on public.songs;
create policy songs_insert on public.songs for insert to authenticated
  with check (
    (select public.app_role_at_least('admin'))
    or (
      (select public.app_role_at_least('contributor'))
      and deleted_at is null
      and added_by_branch_id is not distinct from (select public.app_user_branch())
    )
  );

drop policy if exists songs_update on public.songs;
create policy songs_update on public.songs for update to authenticated
  using (
    (select public.app_role_at_least('admin'))
    or ((select public.app_role_at_least('contributor')) and deleted_at is null)
  )
  with check (
    (select public.app_role_at_least('admin'))
    or ((select public.app_role_at_least('contributor')) and deleted_at is null)
  );

drop policy if exists songs_delete on public.songs;
create policy songs_delete on public.songs for delete to authenticated
  using ((select public.app_role_at_least('admin')));

-- ---------------------------------------------------------------------------
-- Song children (song:write / resource:write). The `exists` on songs runs
-- under songs' own RLS, so children of a soft-deleted song are hidden from,
-- and read-only for, everyone but admins.
-- ---------------------------------------------------------------------------
drop policy if exists song_composers_select on public.song_composers;
create policy song_composers_select on public.song_composers for select to authenticated
  using (exists (select 1 from public.songs s where s.id = song_id));

drop policy if exists song_composers_write on public.song_composers;
create policy song_composers_write on public.song_composers for all to authenticated
  using (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  )
  with check (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  );

drop policy if exists song_keys_select on public.song_keys;
create policy song_keys_select on public.song_keys for select to authenticated
  using (exists (select 1 from public.songs s where s.id = song_id));

drop policy if exists song_keys_write on public.song_keys;
create policy song_keys_write on public.song_keys for all to authenticated
  using (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  )
  with check (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  );

drop policy if exists song_themes_select on public.song_themes;
create policy song_themes_select on public.song_themes for select to authenticated
  using (exists (select 1 from public.songs s where s.id = song_id));

drop policy if exists song_themes_write on public.song_themes;
create policy song_themes_write on public.song_themes for all to authenticated
  using (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  )
  with check (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  );

-- resource:read (any active user) / resource:write (contributor+).
drop policy if exists resources_select on public.resources;
create policy resources_select on public.resources for select to authenticated
  using (exists (select 1 from public.songs s where s.id = song_id));

drop policy if exists resources_write on public.resources;
create policy resources_write on public.resources for all to authenticated
  using (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  )
  with check (
    (select public.app_role_at_least('contributor'))
    and exists (select 1 from public.songs s where s.id = song_id)
  );

-- ---------------------------------------------------------------------------
-- composers: composer:create (contributor+, pop_member left at 'none');
-- composer:merge / set pop_member = update and delete (music_leader+).
-- ---------------------------------------------------------------------------
drop policy if exists composers_select on public.composers;
create policy composers_select on public.composers for select to authenticated
  using ((select public.app_user_role()) is not null);

drop policy if exists composers_insert on public.composers;
create policy composers_insert on public.composers for insert to authenticated
  with check (
    (select public.app_role_at_least('music_leader'))
    or ((select public.app_role_at_least('contributor')) and pop_member = 'none')
  );

drop policy if exists composers_update on public.composers;
create policy composers_update on public.composers for update to authenticated
  using ((select public.app_role_at_least('music_leader')))
  with check ((select public.app_role_at_least('music_leader')));

drop policy if exists composers_delete on public.composers;
create policy composers_delete on public.composers for delete to authenticated
  using ((select public.app_role_at_least('music_leader')));

-- ---------------------------------------------------------------------------
-- themes: theme:create (contributor+); theme:merge = update and delete
-- (music_leader+). theme_synonyms: theme:synonyms (music_leader+).
-- ---------------------------------------------------------------------------
drop policy if exists themes_select on public.themes;
create policy themes_select on public.themes for select to authenticated
  using ((select public.app_user_role()) is not null);

drop policy if exists themes_insert on public.themes;
create policy themes_insert on public.themes for insert to authenticated
  with check ((select public.app_role_at_least('contributor')));

drop policy if exists themes_update on public.themes;
create policy themes_update on public.themes for update to authenticated
  using ((select public.app_role_at_least('music_leader')))
  with check ((select public.app_role_at_least('music_leader')));

drop policy if exists themes_delete on public.themes;
create policy themes_delete on public.themes for delete to authenticated
  using ((select public.app_role_at_least('music_leader')));

drop policy if exists theme_synonyms_select on public.theme_synonyms;
create policy theme_synonyms_select on public.theme_synonyms for select to authenticated
  using ((select public.app_user_role()) is not null);

drop policy if exists theme_synonyms_write on public.theme_synonyms;
create policy theme_synonyms_write on public.theme_synonyms for all to authenticated
  using ((select public.app_role_at_least('music_leader')))
  with check ((select public.app_role_at_least('music_leader')));

-- ---------------------------------------------------------------------------
-- branch_usage: read by any active user; usage:write (contributor+).
-- ---------------------------------------------------------------------------
drop policy if exists branch_usage_select on public.branch_usage;
create policy branch_usage_select on public.branch_usage for select to authenticated
  using ((select public.app_user_role()) is not null);

drop policy if exists branch_usage_write on public.branch_usage;
create policy branch_usage_write on public.branch_usage for all to authenticated
  using ((select public.app_role_at_least('contributor')))
  with check ((select public.app_role_at_least('contributor')));

-- ---------------------------------------------------------------------------
-- lists (REQ-LIST-08).
--   list:read   setlists (not soft-deleted) for any active user; playlists and
--               the owner's own deleted lists for the owner; admin everything.
--   list:create any active user, as owner, stamped with their own branch.
--   list:write  owner; music_leader on a setlist of their branch; admin.
--               Covers rename, soft delete (deleted_at) and hard delete.
-- ---------------------------------------------------------------------------
drop policy if exists lists_select on public.lists;
create policy lists_select on public.lists for select to authenticated
  using (
    (select public.app_role_at_least('admin'))
    or (
      (select public.app_user_role()) is not null
      and (owner_id = (select auth.uid()) or (type = 'setlist' and deleted_at is null))
    )
  );

drop policy if exists lists_insert on public.lists;
create policy lists_insert on public.lists for insert to authenticated
  with check (
    (select public.app_role_at_least('admin'))
    or (
      (select public.app_user_role()) is not null
      and owner_id = (select auth.uid())
      and branch_id is not distinct from (select public.app_user_branch())
    )
  );

drop policy if exists lists_update on public.lists;
create policy lists_update on public.lists for update to authenticated
  using (
    (select public.app_role_at_least('admin'))
    or ((select public.app_user_role()) is not null and owner_id = (select auth.uid()))
    or (
      type = 'setlist'
      and (select public.app_user_role()) = 'music_leader'
      and branch_id = (select public.app_user_branch())
    )
  )
  with check (
    (select public.app_role_at_least('admin'))
    or ((select public.app_user_role()) is not null and owner_id = (select auth.uid()))
    or (
      type = 'setlist'
      and (select public.app_user_role()) = 'music_leader'
      and branch_id = (select public.app_user_branch())
    )
  );

drop policy if exists lists_delete on public.lists;
create policy lists_delete on public.lists for delete to authenticated
  using (
    (select public.app_role_at_least('admin'))
    or ((select public.app_user_role()) is not null and owner_id = (select auth.uid()))
    or (
      type = 'setlist'
      and (select public.app_user_role()) = 'music_leader'
      and branch_id = (select public.app_user_branch())
    )
  );

-- list_items: readable with the list; writable when the list is (list:write).
-- The subqueries on lists run under lists' own select policy.
drop policy if exists list_items_select on public.list_items;
create policy list_items_select on public.list_items for select to authenticated
  using (exists (select 1 from public.lists l where l.id = list_id));

drop policy if exists list_items_write on public.list_items;
create policy list_items_write on public.list_items for all to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  );

-- shares: share:create / share:revoke when list:write holds. Tokens are only
-- visible to users who can write the list; public reads use the service role.
drop policy if exists shares_select on public.shares;
create policy shares_select on public.shares for select to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  );

drop policy if exists shares_insert on public.shares;
create policy shares_insert on public.shares for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  );

drop policy if exists shares_update on public.shares;
create policy shares_update on public.shares for update to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  );

drop policy if exists shares_delete on public.shares;
create policy shares_delete on public.shares for delete to authenticated
  using (
    exists (
      select 1 from public.lists l
      where l.id = list_id
        and (
          (select public.app_role_at_least('admin'))
          or l.owner_id = (select auth.uid())
          or (
            l.type = 'setlist'
            and (select public.app_user_role()) = 'music_leader'
            and l.branch_id = (select public.app_user_branch())
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- audit_log: audit:read (contributor+). Append-only and written by server
-- code (lib/audit.ts), so the API roles get no write policy.
-- ---------------------------------------------------------------------------
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select public.app_role_at_least('contributor')));

-- ---------------------------------------------------------------------------
-- Storage: private bucket `resources` (contracts/schema.md "Storage").
-- Read: any active user. Write (upload / replace / delete): contributor+.
-- The server issues signed URLs with the service role; these policies cover
-- direct Storage API calls made with a user's JWT. Creating the bucket here
-- keeps local and CI stacks in line with hosted projects (OPS-01); it's a
-- no-op where the bucket already exists.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('resources', 'resources', false)
on conflict (id) do nothing;

drop policy if exists resources_bucket_select on storage.objects;
create policy resources_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'resources' and (select public.app_user_role()) is not null);

drop policy if exists resources_bucket_insert on storage.objects;
create policy resources_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'resources' and (select public.app_role_at_least('contributor')));

drop policy if exists resources_bucket_update on storage.objects;
create policy resources_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'resources' and (select public.app_role_at_least('contributor')))
  with check (bucket_id = 'resources' and (select public.app_role_at_least('contributor')));

drop policy if exists resources_bucket_delete on storage.objects;
create policy resources_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'resources' and (select public.app_role_at_least('contributor')));
