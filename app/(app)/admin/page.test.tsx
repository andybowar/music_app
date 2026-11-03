// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { users } from '@/fixtures';
import type { AppUser, Role } from '@/types/domain';

vi.mock('server-only', () => ({}));

const requirePageUser = vi.fn<(next?: string) => Promise<AppUser>>();
vi.mock('@/lib/auth', () => ({ requirePageUser: (next?: string) => requirePageUser(next) }));

const listUsers = vi.fn<(filter?: { accessStatus?: string }) => Promise<unknown[]>>();
vi.mock('@/features/admin/server', () => ({
  listUsers: (filter?: { accessStatus?: string }) => listUsers(filter),
}));

const reportError = vi.fn();
vi.mock('@/lib/log', () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

const { default: AdminPage, dynamic } = await import('./page');

const as = (role: Role): AppUser => ({
  ...users[0]!,
  role,
  accessStatus: 'approved',
  disabledAt: null,
});

const html = async () => renderToStaticMarkup(await AdminPage());

beforeEach(() => {
  vi.clearAllMocks();
  listUsers.mockResolvedValue([{}, {}]);
});

describe('/admin dashboard', () => {
  it('renders dynamically and asks for a session with next=/admin', async () => {
    expect(dynamic).toBe('force-dynamic');
    requirePageUser.mockResolvedValue(as('admin'));
    await html();
    expect(requirePageUser).toHaveBeenCalledWith('/admin');
  });

  it('shows admins every area and the pending count', async () => {
    requirePageUser.mockResolvedValue(as('admin'));
    const out = await html();
    for (const href of ['/admin/users', '/admin/branches', '/admin/themes']) {
      expect(out).toContain(`href="${href}"`);
    }
    expect(out).toContain('2 pending');
    expect(listUsers).toHaveBeenCalledWith({ accessStatus: 'pending' });
  });

  it('hides the badge when nothing is pending', async () => {
    requirePageUser.mockResolvedValue(as('admin'));
    listUsers.mockResolvedValue([]);
    expect(await html()).not.toContain('pending</span>');
  });

  it('still renders the cards when the count fails', async () => {
    requirePageUser.mockResolvedValue(as('admin'));
    listUsers.mockRejectedValue(new Error('db down'));
    const out = await html();
    expect(out).toContain('href="/admin/users"');
    expect(out).not.toContain(' pending');
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it('shows music leaders only Themes, without counting users', async () => {
    requirePageUser.mockResolvedValue(as('music_leader'));
    const out = await html();
    expect(out).toContain('href="/admin/themes"');
    expect(out).not.toContain('href="/admin/users"');
    expect(out).not.toContain('href="/admin/branches"');
    expect(listUsers).not.toHaveBeenCalled();
  });

  it.each(['member', 'contributor'] as const)('shows a %s the 403 page', async (role) => {
    requirePageUser.mockResolvedValue(as(role));
    const out = await html();
    expect(out).toContain('403');
    expect(out).not.toContain('href="/admin/');
  });

  it('lets the auth redirect through', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/login;307;',
    });
    requirePageUser.mockRejectedValue(redirect);
    await expect(AdminPage()).rejects.toBe(redirect);
  });
});
