import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { BugReportActions } from '../types';
import { makeBug, makeBugImage, polyfillDom } from './testUtils';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('./bugActions', () => ({ SERVER_BUG_ACTIONS: {} }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const { BugReportDetail } = await import('./BugReportDetail');

beforeAll(polyfillDom);
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const BUG = makeBug({
  images: [makeBugImage(1), makeBugImage(2)],
  adminNote: 'We are on it.',
});

function fakeActions(): Partial<BugReportActions> {
  return {
    updateBugReport: vi.fn(async (_id, patch) => ({
      ok: true as const,
      data: {
        ...BUG,
        ...patch,
        adminNote: patch.adminNote === undefined ? BUG.adminNote : patch.adminNote || null,
      } as typeof BUG,
    })),
    deleteBugReport: vi.fn(async () => ({ ok: true as const, data: undefined })),
    navigate: vi.fn(),
  };
}

describe('BugReportDetail as the reporter', () => {
  it('shows the report, the status as text and the admins’ note, without triage controls', () => {
    render(<BugReportDetail report={BUG} actions={fakeActions()} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Search is broken' })).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('We are on it.')).toBeInTheDocument();
    expect(screen.getByText('Results')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '/library' })).toHaveAttribute('href', '/library');
    expect(screen.getByText('Chrome 130 on macOS')).toBeInTheDocument();
    expect(screen.getByText('1280 × 800')).toBeInTheDocument();
    expect(screen.getByText('abcdef123456')).toBeInTheDocument();
    expect(screen.queryByText('Reported by')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Note to the reporter')).not.toBeInTheDocument();
  });

  it('opens a screenshot full size', async () => {
    render(<BugReportDetail report={BUG} />);
    await userEvent.click(screen.getByRole('button', { name: 'Open screen-2.png full size' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Image 2 of 2', { exact: false })).toBeInTheDocument();
  });

  it('says when nothing was expected or attached', () => {
    render(<BugReportDetail report={makeBug({ expected: null, pagePath: null })} />);
    expect(screen.getByText('Not given.')).toBeInTheDocument();
    expect(screen.getByText('No screenshots.')).toBeInTheDocument();
  });
});

describe('BugReportDetail as an admin', () => {
  it('shows the reporter and changes the status', async () => {
    const actions = fakeActions();
    render(<BugReportDetail report={BUG} admin actions={actions} />);
    expect(screen.getByText('Reported by')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'confirmed');
    expect(actions.updateBugReport).toHaveBeenCalledWith(BUG.id, { status: 'confirmed' });
    expect(toast.success).toHaveBeenCalledWith('Status set to Confirmed');
  });

  it('rolls the status back when saving fails', async () => {
    const actions = fakeActions();
    actions.updateBugReport = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'INTERNAL' as const, message: 'Nope.' },
    }));
    render(<BugReportDetail report={BUG} admin actions={actions} />);
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'fixed');
    expect(screen.getByLabelText('Status')).toHaveValue('new');
    expect(toast.error).toHaveBeenCalled();
  });

  it('saves the note to the reporter', async () => {
    const actions = fakeActions();
    render(<BugReportDetail report={BUG} admin actions={actions} />);
    const note = screen.getByLabelText('Note to the reporter');
    const save = screen.getByRole('button', { name: 'Save note' });
    expect(save).toBeDisabled();
    await userEvent.clear(note);
    await userEvent.type(note, 'Fixed in the next release.');
    await userEvent.click(save);
    expect(actions.updateBugReport).toHaveBeenCalledWith(BUG.id, {
      adminNote: 'Fixed in the next release.',
    });
    expect(toast.success).toHaveBeenCalledWith('Note saved');
  });

  it('deletes after confirmation', async () => {
    const actions = fakeActions();
    render(<BugReportDetail report={BUG} admin actions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('and its screenshots');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete report' }));
    expect(actions.deleteBugReport).toHaveBeenCalledWith(BUG.id);
    expect(actions.navigate).toHaveBeenCalledWith('/admin/bugs');
  });
});
