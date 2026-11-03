import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { polyfillDom } from '@/features/admin/backlog/ui/testUtils';

vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/features/admin/backlog/ui/requestActions', () => ({ SERVER_REQUEST_ACTIONS: {} }));
vi.mock('@/features/admin/backlog/server', () => ({
  addTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
}));

const { AdminBacklogGallery, fakeRequestActions, galleryDetail, placeholderWireframe } =
  await import('./AdminBacklogGallery');

beforeAll(polyfillDom);
afterEach(cleanup);

describe('AdminBacklogGallery', () => {
  it('renders every section, and the to-do states', async () => {
    render(<AdminBacklogGallery />);
    for (const title of [
      'To-dos',
      'Request list',
      'Request form (interactive)',
      'Request form · uploading',
      'Request form · a failed image',
      'Request form · validation errors',
      'Request detail (3 images)',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: /full size/ })).toHaveLength(3);
    await userEvent.selectOptions(screen.getByLabelText('State'), 'empty');
    expect(screen.getByText('No to-dos yet.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('State'), 'error');
    expect(screen.getByText(/Couldn't load the to-dos/)).toBeInTheDocument();
  });

  it('uses generated placeholder images only', () => {
    expect(placeholderWireframe(1)).toMatch(/^data:image\/svg\+xml/);
    expect(galleryDetail.images.every((i) => i.url.startsWith('data:image/svg+xml'))).toBe(true);
  });

  it('the stub fails a "fail" file once and refuses the title "taken"', async () => {
    const api = fakeRequestActions();
    expect((await api.finalizeRequestImage('pending:menu-fail.png')).ok).toBe(false);
    expect((await api.finalizeRequestImage('pending:menu-fail.png')).ok).toBe(true);
    const taken = await api.createRequest({ kind: 'change', title: 'taken' });
    expect(taken).toMatchObject({
      ok: false,
      error: { fieldErrors: { title: [expect.any(String)] } },
    });
  });
});
