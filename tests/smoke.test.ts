import { describe, expect, it, vi } from 'vitest';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));

describe('scaffold smoke', () => {
  it('root page redirects to the library', async () => {
    const { default: RootPage } = await import('@/app/page');
    RootPage();
    expect(redirect).toHaveBeenCalledWith('/library');
  });
});
