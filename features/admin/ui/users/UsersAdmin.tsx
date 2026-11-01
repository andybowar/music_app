'use client';

import { SearchIcon, UserPlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AdminUser, BranchOption } from '@/features/admin/server';
import type { ActionResult, Role, UUID } from '@/types/domain';

import { BranchSelect, LocalDate, PROVIDER_LABEL, RoleSelect } from './fields';
import { ApproveUserDialog, InviteUserDialog, type InviteInput } from './UserDialogs';

type UserPatch = { role?: Role; branchId?: string | null; disabled?: boolean };

export interface UsersAdminProps {
  users: AdminUser[];
  branches: BranchOption[];
  /** The signed-in admin: can't disable or decide their own account. */
  currentUserId: UUID;
  onInvite(input: InviteInput): Promise<ActionResult<AdminUser>>;
  onUpdate(id: UUID, patch: UserPatch): Promise<ActionResult<void>>;
  onApprove(id: UUID, input: { role: Role; branchId: string | null }): Promise<ActionResult<void>>;
  onReject(id: UUID): Promise<ActionResult<void>>;
}

/** Case-insensitive match on name or email. */
export function matchesQuery(user: Pick<AdminUser, 'name' | 'email'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q);
}

export function UsersAdmin({
  users: initialUsers,
  branches,
  currentUserId,
  onInvite,
  onUpdate,
  onApprove,
  onReject,
}: UsersAdminProps) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<ReadonlySet<UUID>>(new Set());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [approving, setApproving] = useState<AdminUser | null>(null);

  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  const visible = users.filter((u) => matchesQuery(u, query));
  const pending = visible.filter((u) => u.accessStatus === 'pending');
  const rejected = visible.filter((u) => u.accessStatus === 'rejected');
  const pendingCount = users.filter((u) => u.accessStatus === 'pending').length;

  const patchLocal = (id: UUID, patch: Partial<AdminUser>) =>
    setUsers((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  /** Runs one mutation for a user, with the row locked and a toast either way. */
  async function run(id: UUID, action: () => Promise<ActionResult<unknown>>, success: string) {
    setBusy((s) => new Set(s).add(id));
    const result = await action();
    setBusy((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    if (result.ok) toast.success(success);
    else toast.error(result.error.message);
    return result.ok;
  }

  async function update(user: AdminUser, patch: UserPatch, success: string) {
    const ok = await run(user.id, () => onUpdate(user.id, patch), success);
    if (!ok) return;
    const local: Partial<AdminUser> = {};
    if (patch.role !== undefined) local.role = patch.role;
    if (patch.branchId !== undefined) {
      local.branchId = patch.branchId;
      local.branchName = patch.branchId ? (branchName.get(patch.branchId) ?? null) : null;
    }
    if (patch.disabled !== undefined) {
      local.disabledAt = patch.disabled ? new Date().toISOString() : null;
    }
    patchLocal(user.id, local);
  }

  async function approve(user: AdminUser, input: { role: Role; branchId: string | null }) {
    const ok = await run(user.id, () => onApprove(user.id, input), `${user.name} approved`);
    if (ok) {
      patchLocal(user.id, {
        ...input,
        accessStatus: 'approved',
        branchName: input.branchId ? (branchName.get(input.branchId) ?? null) : null,
      });
    }
    return ok;
  }

  async function reject(user: AdminUser) {
    const ok = await run(user.id, () => onReject(user.id), `${user.name}'s request rejected`);
    if (ok) patchLocal(user.id, { accessStatus: 'rejected' });
  }

  async function invite(input: InviteInput) {
    const result = await onInvite(input);
    if (result.ok) {
      setUsers((list) => [...list, result.data].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`Invite sent to ${result.data.email}`);
    }
    return result;
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label="Search users by name or email"
            placeholder="Search by name or email"
            className="pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <UserPlusIcon aria-hidden />
          Invite user
        </Button>
      </div>

      <Tabs defaultValue={pendingCount > 0 ? 'requests' : 'all'}>
        <TabsList>
          <TabsTrigger value="all">All users</TabsTrigger>
          <TabsTrigger value="requests">
            Access requests
            <Badge
              variant={pendingCount > 0 ? 'default' : 'secondary'}
              aria-label={`${pendingCount} pending`}
            >
              {pendingCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          {visible.length === 0 ? (
            <Empty>{query ? 'No users match your search.' : 'No users yet.'}</Empty>
          ) : (
            <ul className="divide-y rounded-md border">
              {visible.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  branches={branches}
                  isSelf={u.id === currentUserId}
                  busy={busy.has(u.id)}
                  onUpdate={update}
                />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="requests" className="grid gap-6">
          <section aria-labelledby="pending-heading" className="grid gap-2">
            <h2 id="pending-heading" className="text-sm font-medium">
              Waiting for review
            </h2>
            {pending.length === 0 ? (
              <Empty>
                {query ? 'No requests match your search.' : 'No access requests right now.'}
              </Empty>
            ) : (
              <ul className="divide-y rounded-md border">
                {pending.map((u) => (
                  <RequestRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === currentUserId}
                    busy={busy.has(u.id)}
                    onApprove={() => setApproving(u)}
                    onReject={() => reject(u)}
                  />
                ))}
              </ul>
            )}
          </section>
          {rejected.length > 0 ? (
            <section aria-labelledby="rejected-heading" className="grid gap-2">
              <h2 id="rejected-heading" className="text-sm font-medium">
                Rejected
              </h2>
              <ul className="divide-y rounded-md border">
                {rejected.map((u) => (
                  <RequestRow
                    key={u.id}
                    user={u}
                    isSelf={u.id === currentUserId}
                    busy={busy.has(u.id)}
                    onApprove={() => setApproving(u)}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </TabsContent>
      </Tabs>

      <InviteUserDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        branches={branches}
        onInvite={invite}
      />
      <ApproveUserDialog
        key={approving?.id ?? 'none'}
        user={approving}
        onOpenChange={(open) => (open ? undefined : setApproving(null))}
        branches={branches}
        onApprove={approve}
      />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function Identity({ user }: { user: AdminUser }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium">{user.name}</p>
      <p className="truncate text-sm text-muted-foreground">{user.email}</p>
    </div>
  );
}

function UserRow({
  user,
  branches,
  isSelf,
  busy,
  onUpdate,
}: {
  user: AdminUser;
  branches: BranchOption[];
  isSelf: boolean;
  busy: boolean;
  onUpdate(user: AdminUser, patch: UserPatch, success: string): void;
}) {
  const disabled = user.disabledAt !== null;
  return (
    <li className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_10rem_10rem_6.5rem] md:items-center">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <Identity user={user} />
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {isSelf ? <Badge variant="outline">You</Badge> : null}
          {user.accessStatus !== 'approved' ? (
            <Badge variant="secondary">
              {user.accessStatus === 'pending' ? 'Pending' : 'Rejected'}
            </Badge>
          ) : null}
          {disabled ? <Badge variant="destructive">Disabled</Badge> : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:contents">
        <RoleSelect
          aria-label={`Role for ${user.name}`}
          value={user.role}
          disabled={busy}
          onChange={(role) => onUpdate(user, { role }, `${user.name} is now ${roleText(role)}`)}
        />
        <BranchSelect
          aria-label={`Branch for ${user.name}`}
          value={user.branchId}
          branches={branches}
          disabled={busy}
          onChange={(branchId) => onUpdate(user, { branchId }, `${user.name}'s branch updated`)}
        />
      </div>
      <Button
        variant={disabled ? 'outline' : 'ghost'}
        size="sm"
        disabled={busy || (isSelf && !disabled)}
        title={isSelf && !disabled ? "You can't disable your own account" : undefined}
        aria-label={`${disabled ? 'Enable' : 'Disable'} ${user.name}`}
        onClick={() =>
          onUpdate(
            user,
            { disabled: !disabled },
            `${user.name} ${disabled ? 'enabled' : 'disabled'}`,
          )
        }
      >
        {disabled ? 'Enable' : 'Disable'}
      </Button>
    </li>
  );
}

function roleText(role: Role): string {
  return role === 'music_leader' ? 'a music leader' : role === 'admin' ? 'an admin' : `a ${role}`;
}

function RequestRow({
  user,
  isSelf,
  busy,
  onApprove,
  onReject,
}: {
  user: AdminUser;
  isSelf: boolean;
  busy: boolean;
  onApprove(): void;
  onReject?(): void;
}) {
  return (
    <li className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="grid min-w-0 gap-1">
        <Identity user={user} />
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <div className="flex gap-1">
            <dt>Provider:</dt>
            <dd>{PROVIDER_LABEL[user.authProvider]}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Requested:</dt>
            <dd>
              <LocalDate iso={user.createdAt} />
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>Suggested branch:</dt>
            <dd>{user.branchName ?? 'None'}</dd>
          </div>
        </dl>
      </div>
      {isSelf ? (
        <p className="text-sm text-muted-foreground">Another admin must review your request.</p>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={onApprove} aria-label={`Approve ${user.name}`}>
            Approve
          </Button>
          {onReject ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={onReject}
              aria-label={`Reject ${user.name}`}
            >
              Reject
            </Button>
          ) : null}
        </div>
      )}
    </li>
  );
}
