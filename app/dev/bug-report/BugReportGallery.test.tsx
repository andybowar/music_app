import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { polyfillDom } from '@/features/bugs/ui/testUtils';

vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/features/bugs/ui/bugActions', () => ({ SERVER_BUG_ACTIONS: {} }));
vi.mock('@/features/admin/backlog/ui/requestActions', () => ({ SERVER_REQUEST_ACTIONS: {} }));

const { BugReportGallery, fakeBugActions, galleryDetail, placeholderScreenshot } =
  await import('./BugReportGallery');

beforeAll(polyfillDom);
afterEach(cleanup);

describe('BugReportGallery', () => {
  it('renders every state', async () => {
    render(<BugReportGallery />);
    for (const title of [
      'Report form (interactive)',
      'Report form · empty',
      'Report form · validation errors',
      'Report form · uploading',
      'Report form · a failed screenshot',
      'Report form · sent',
      'Report lists',
      'Report detail · as the reporter',
      'Report detail · as an admin',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText('Thanks — we got it')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /full size/ })).toHaveLength(4);
    await userEvent.click(screen.getByLabelText('Empty'));
    expect(screen.getByText("You haven't reported any bugs.")).toBeInTheDocument();
    expect(screen.getAllByText('No bug reports yet.')).toHaveLength(2);
  });

  it('uses generated placeholder images only', () => {
    expect(placeholderScreenshot(1)).toMatch(/^data:image\/svg\+xml/);
    expect(galleryDetail.images.every((i) => i.url.startsWith('data:image/svg+xml'))).toBe(true);
  });

  it('the stub fails a "fail" file once and rate limits the title "limit"', async () => {
    const api = fakeBugActions();
    const limited = await api.createBugReport({ title: 'limit', description: 'x' });
    expect(limited).toMatchObject({ ok: false, error: { code: 'RATE_LIMITED' } });
    expect((await api.finalizeBugImage('pending:x-fail.png')).ok).toBe(false);
    expect((await api.finalizeBugImage('pending:x-fail.png')).ok).toBe(true);
  });
});
