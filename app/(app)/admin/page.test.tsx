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

const listTodos = vi.fn<() => Promise<unknown>>();
const listRequests = vi.fn<() => Promise<unknown[]>>();
vi.mock('@/features/admin/backlog/server', () => ({
  listTodos: () => listTodos(),
  listRequests: () => listRequests(),
  addTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
}));
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

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
  listTodos.mockResolvedValue({ ok: true, data: [todo] });
  listRequests.mockResolvedValue(
    Array.from({ length: 7 }, (_, i) => ({ ...request, id: `req-${i}`, title: `Request ${i}` })),
  );
});

const todo = {
  id: 'todo-1',
  title: 'Check the import',
  notes: null,
  doneAt: null,
  doneBy: null,
  createdBy: 'u',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};
const request = {
  kind: 'enhancement',
  description: '',
  status: 'new',
  createdBy: 'u',
  createdByName: 'Admin',
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
  imageCount: 0,
};

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

  it('shows admins the to-dos and the 5 newest requests (ADM-06)', async () => {
    requirePageUser.mockResolvedValue(as('admin'));
    const out = await html();
    expect(out).toContain('To-dos');
    expect(out).toContain('Check the import');
    expect(out).toContain('Enhancement requests');
    expect(out).toContain('href="/admin/requests/new"');
    expect(out).toContain('href="/admin/requests"');
    expect(out.match(/href="\/admin\/requests\/req-/g)).toHaveLength(5);
  });

  it('shows an error in only the section that failed to load', async () => {
    requirePageUser.mockResolvedValue(as('admin'));
    listTodos.mockResolvedValue({ ok: false, error: { code: 'INTERNAL', message: 'x' } });
    let out = await html();
    expect(out).toContain('load the to-dos');
    expect(out).toContain('Request 0');

    listTodos.mockResolvedValue({ ok: true, data: [] });
    listRequests.mockRejectedValue(new Error('db down'));
    out = await html();
    expect(out).toContain('No to-dos yet.');
    expect(out).toContain('load the requests');
    expect(reportError).toHaveBeenCalledTimes(2);
  });

  it('shows music leaders no backlog sections', async () => {
    requirePageUser.mockResolvedValue(as('music_leader'));
    const out = await html();
    expect(out).not.toContain('To-dos');
    expect(out).not.toContain('Enhancement requests');
    expect(listTodos).not.toHaveBeenCalled();
    expect(listRequests).not.toHaveBeenCalled();
  });

  it('lets the auth redirect through', async () => {
    const redirect = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/login;307;',
    });
    requirePageUser.mockRejectedValue(redirect);
    await expect(AdminPage()).rejects.toBe(redirect);
  });
});
