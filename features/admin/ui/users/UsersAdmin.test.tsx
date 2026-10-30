import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { branches as fixtureBranches, users as fixtureUsers } from '@/fixtures';
import type { AdminUser, BranchOption } from '@/features/admin/server';
import type { ActionResult } from '@/types/domain';

import { matchesQuery, UsersAdmin, type UsersAdminProps } from './UsersAdmin';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const branches: BranchOption[] = fixtureBranches.map(({ id, name, code }) => ({ id, name, code }));
const CREATED = '2026-10-01T12:00:00.000Z';

function adminUser(i: number, patch: Partial<AdminUser> = {}): AdminUser {
  const base = fixtureUsers[i];
  if (!base) throw new Error(`fixture user ${i} missing`);
  const branch = branches.find((b) => b.id === base.branchId);
  return {
    id: base.id,
    email: base.email,
    name: base.name,
    branchId: base.branchId,
    branchName: branch?.name ?? null,
    role: base.role,
    authProvider: base.authProvider,
    accessStatus: 'approved',
    disabledAt: null,
    createdAt: CREATED,
    ...patch,
  };
}

const me = adminUser(0); // Jordan Ellis, admin
const leader = adminUser(1); // Maria Chen
const requester = adminUser(2, { accessStatus: 'pending', role: 'member' }); // Sam Patel

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });

function setup(props: Partial<UsersAdminProps> = {}) {
  const handlers = {
    onInvite: vi.fn(async (input: { email: string; name: string }) =>
      ok(adminUser(3, { email: input.email, name: input.name })),
    ),
    onUpdate: vi.fn(async () => ok(undefined)),
    onApprove: vi.fn(async () => ok(undefined)),
    onReject: vi.fn(async () => ok(undefined)),
  };
  render(
    <UsersAdmin
      users={[me, leader, requester]}
      branches={branches}
      currentUserId={me.id}
      {...handlers}
      {...props}
    />,
  );
  return { user: userEvent.setup(), ...handlers };
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('matchesQuery', () => {
  it('matches name or email, case-insensitively; blank matches all', () => {
    expect(matchesQuery(leader, 'maria')).toBe(true);
    expect(matchesQuery(leader, ' CHEN@EXAMPLE ')).toBe(true);
    expect(matchesQuery(leader, 'sam')).toBe(false);
    expect(matchesQuery(leader, '  ')).toBe(true);
  });
});

describe('UsersAdmin', () => {
  it('opens on access requests with a count when some are pending', () => {
    setup();
    const tab = screen.getByRole('tab', { name: /access requests/i });
    expect(tab).toHaveAttribute('aria-selected', 'true');
    expect(within(tab).getByLabelText('1 pending')).toBeInTheDocument();
    expect(screen.getByText('Sam Patel')).toBeInTheDocument();
    expect(screen.getByText('Microsoft')).toBeInTheDocument();
    expect(screen.getByText('Suggested branch:').nextSibling).toHaveTextContent(
      requester.branchName ?? '',
    );
  });

  it('opens on all users, with an empty state for requests, when none are pending', async () => {
    const { user } = setup({ users: [me, leader] });
    expect(screen.getByRole('tab', { name: /all users/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await user.click(screen.getByRole('tab', { name: /access requests/i }));
    expect(await screen.findByText('No access requests right now.')).toBeInTheDocument();
  });

  it('approves with the chosen role and the pre-filled branch', async () => {
    const { user, onApprove } = setup();
    await user.click(screen.getByRole('button', { name: 'Approve Sam Patel' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Branch')).toHaveValue(requester.branchId);
    await user.selectOptions(within(dialog).getByLabelText('Role'), 'contributor');
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));

    expect(onApprove).toHaveBeenCalledWith(requester.id, {
      role: 'contributor',
      branchId: requester.branchId,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toastMock.success).toHaveBeenCalledWith('Sam Patel approved');
    expect(screen.getByText('No access requests right now.')).toBeInTheDocument();
  });

  it('rejects, then lists the user under Rejected where they can still be approved', async () => {
    const { user, onReject } = setup();
    await user.click(screen.getByRole('button', { name: 'Reject Sam Patel' }));
    expect(onReject).toHaveBeenCalledWith(requester.id);
    const rejected = await screen.findByRole('region', { name: 'Rejected' });
    expect(within(rejected).getByRole('button', { name: 'Approve Sam Patel' })).toBeEnabled();
    expect(within(rejected).queryByRole('button', { name: /reject/i })).toBeNull();
  });

  it("doesn't offer decisions on the admin's own request", () => {
    setup({ users: [{ ...me, accessStatus: 'pending' }] });
    expect(screen.getByText('Another admin must review your request.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve/i })).toBeNull();
  });

  it('searches by name or email, with an empty state', async () => {
    const { user } = setup({ users: [me, leader] });
    const search = screen.getByRole('searchbox', { name: /search users/i });
    await user.type(search, 'maria');
    expect(screen.getByText('Maria Chen')).toBeInTheDocument();
    expect(screen.queryByText('Jordan Ellis')).toBeNull();
    await user.clear(search);
    await user.type(search, 'nobody');
    expect(screen.getByText('No users match your search.')).toBeInTheDocument();
  });

  it('changes a role; on failure keeps the old value and shows the error', async () => {
    const onUpdate = vi
      .fn<UsersAdminProps['onUpdate']>()
      .mockResolvedValueOnce(ok(undefined))
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'CONFLICT', message: 'There must be at least one active admin.' },
      });
    const { user } = setup({ users: [me, leader], onUpdate });

    const leaderRole = screen.getByLabelText('Role for Maria Chen');
    await user.selectOptions(leaderRole, 'contributor');
    expect(onUpdate).toHaveBeenCalledWith(leader.id, { role: 'contributor' });
    await waitFor(() => expect(leaderRole).toHaveValue('contributor'));

    const myRole = screen.getByLabelText('Role for Jordan Ellis');
    await user.selectOptions(myRole, 'member');
    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('There must be at least one active admin.'),
    );
    expect(myRole).toHaveValue('admin');
  });

  it('disables and enables others, but not yourself', async () => {
    const { user, onUpdate } = setup({ users: [me, leader] });
    expect(screen.getByRole('button', { name: 'Disable Jordan Ellis' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Disable Maria Chen' }));
    expect(onUpdate).toHaveBeenCalledWith(leader.id, { disabled: true });
    expect(await screen.findByText('Disabled')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enable Maria Chen' }));
    expect(onUpdate).toHaveBeenLastCalledWith(leader.id, { disabled: false });
  });

  it('changes a branch', async () => {
    const { user, onUpdate } = setup({ users: [me, leader] });
    await user.selectOptions(screen.getByLabelText('Branch for Maria Chen'), '');
    expect(onUpdate).toHaveBeenCalledWith(leader.id, { branchId: null });
  });

  it('invites a user and shows field errors from the server', async () => {
    const onInvite = vi
      .fn<UsersAdminProps['onInvite']>()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'CONFLICT',
          message: 'Someone with that email already has an account.',
          fieldErrors: { email: ['This email already has an account'] },
        },
      })
      .mockResolvedValueOnce(ok(adminUser(3, { email: 'new@example.com', name: 'New Person' })));
    const { user } = setup({ users: [me], onInvite });

    await user.click(screen.getByRole('button', { name: 'Invite user' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Email'), 'new@example.com');
    await user.type(within(dialog).getByLabelText('Name'), 'New Person');
    await user.click(within(dialog).getByRole('button', { name: 'Send invite' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/already has an account/);
    expect(within(dialog).getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');

    await user.click(within(dialog).getByRole('button', { name: 'Send invite' }));
    expect(onInvite).toHaveBeenLastCalledWith({
      email: 'new@example.com',
      name: 'New Person',
      role: 'member',
      branchId: null,
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toastMock.success).toHaveBeenCalledWith('Invite sent to new@example.com');
    expect(screen.getByText('New Person')).toBeInTheDocument();
  });
});
