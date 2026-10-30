import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppUser } from '@/types/domain';

vi.mock('server-only', () => ({}));

const getUser = vi.fn<() => Promise<AppUser | null>>();
vi.mock('@/lib/auth', () => ({ getUser }));
vi.mock('@/features/auth/actions', () => ({ signOut: vi.fn() }));

class Redirect extends Error {}
const redirect = vi.fn((to: string) => {
  throw new Redirect(to);
});
vi.mock('next/navigation', () => ({ redirect, useRouter: () => ({}) }));

const { default: AccountStatusPage } = await import('./page');

const USER: AppUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'ana@example.test',
  name: 'Ana Example',
  branchId: null,
  role: 'member',
  authProvider: 'password',
  disabledAt: null,
  accessStatus: 'pending',
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('/account-status', () => {
  it.each([
    ['pending', 'Awaiting approval'],
    ['rejected', 'Request declined'],
  ] as const)('shows the %s status for the signed-in user', async (accessStatus, heading) => {
    getUser.mockResolvedValue({ ...USER, accessStatus });
    render(await AccountStatusPage());
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    expect(screen.getByText(/Signed in as/)).toHaveTextContent('Ana Example (ana@example.test)');
    expect(redirect).not.toHaveBeenCalled();
  });

  it('sends signed-out visitors to /login', async () => {
    getUser.mockResolvedValue(null);
    await expect(AccountStatusPage()).rejects.toThrow('/login');
  });

  it('sends approved users to the library', async () => {
    getUser.mockResolvedValue({ ...USER, accessStatus: 'approved' });
    await expect(AccountStatusPage()).rejects.toThrow('/library');
  });
});
