import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/types/domain';

import type { BugReportActions, BugReportImage } from '../types';
import { makeBug, makeBugImage, pngFile, polyfillDom } from './testUtils';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('./bugActions', () => ({ SERVER_BUG_ACTIONS: {} }));
vi.mock('@/features/admin/backlog/ui/requestActions', () => ({ SERVER_REQUEST_ACTIONS: {} }));

const { BugReportForm } = await import('./BugReportForm');

beforeAll(polyfillDom);
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const BUG = makeBug();

function fakeActions(opts: { failFinalizeFor?: string[]; create?: ActionResult<never> } = {}) {
  const failing = new Set(opts.failFinalizeFor ?? []);
  const actions: BugReportActions = {
    createBugReport: vi.fn(async (input) =>
      opts.create
        ? opts.create
        : {
            ok: true as const,
            data: { ...BUG, title: input.title, description: input.description },
          },
    ),
    updateBugReport: vi.fn(),
    deleteBugReport: vi.fn(),
    createBugImageUpload: vi.fn(async (_id, input) => ({
      ok: true as const,
      data: { pendingId: `pending:${input.fileName}`, uploadUrl: 'https://up.test/1' },
    })),
    finalizeBugImage: vi.fn(async (pendingId): Promise<ActionResult<BugReportImage>> => {
      const name = pendingId.replace('pending:', '');
      if (failing.has(name)) {
        failing.delete(name); // fails once, so Retry succeeds
        return { ok: false, error: { code: 'VALIDATION', message: 'Upload check failed.' } };
      }
      return { ok: true, data: { ...makeBugImage(1), fileName: name } };
    }),
    deleteBugImage: vi.fn(),
    putFile: vi.fn(async (_url, _file, onProgress) => onProgress(1)),
    navigate: vi.fn(),
  };
  return actions;
}

const input = () => screen.getByTestId('screenshot-input') as HTMLInputElement;

async function fill() {
  await userEvent.type(screen.getByLabelText('What went wrong?'), 'Search is broken');
  await userEvent.type(screen.getByLabelText('What happened?'), 'Nothing came back');
}

describe('BugReportForm', () => {
  it('shows what is sent with the report', async () => {
    render(<BugReportForm pagePath="/songs/1" actions={fakeActions()} />);
    const sent = screen.getByRole('region', { name: 'Sent with your report' });
    expect(sent).toHaveTextContent('/songs/1');
    // jsdom's window is 1024×768.
    await waitFor(() => expect(sent).toHaveTextContent('1024 × 768'));
    expect(sent).not.toHaveTextContent('Detecting');
  });

  it('shows validation errors inline and does not submit', async () => {
    const actions = fakeActions();
    render(<BugReportForm actions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(screen.getByText('Tell us what went wrong')).toBeInTheDocument();
    expect(screen.getByText('Describe what happened')).toBeInTheDocument();
    expect(screen.getByLabelText('What went wrong?')).toHaveAttribute('aria-invalid', 'true');
    expect(actions.createBugReport).not.toHaveBeenCalled();
  });

  it('sends the report with page and browser details, then thanks the user', async () => {
    const actions = fakeActions();
    render(<BugReportForm pagePath="/library" actions={actions} />);
    await fill();
    await userEvent.type(screen.getByLabelText(/What did you expect/), 'Results');
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Thanks — we got it')).toBeInTheDocument();
    expect(actions.createBugReport).toHaveBeenCalledWith({
      title: 'Search is broken',
      description: 'Nothing came back',
      expected: 'Results',
      pagePath: '/library',
      userAgent: navigator.userAgent,
      viewport: '1024x768',
    });
    expect(screen.getByRole('link', { name: 'View your report' })).toHaveAttribute(
      'href',
      `/bugs/${BUG.id}`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Report another bug' }));
    expect(screen.getByLabelText('What went wrong?')).toHaveValue('');
  });

  it('uploads screenshots after saving the report', async () => {
    const actions = fakeActions();
    render(<BugReportForm actions={actions} />);
    await fill();
    await userEvent.upload(input(), [pngFile('a.png'), pngFile('b.png')]);
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Thanks — we got it')).toBeInTheDocument();
    expect(screen.getByText(/and 2 screenshots/)).toBeInTheDocument();
    expect(actions.createBugImageUpload).toHaveBeenCalledTimes(2);
    expect(actions.finalizeBugImage).toHaveBeenCalledWith('pending:a.png');
  });

  it('keeps the report when a screenshot fails, and offers Retry', async () => {
    const actions = fakeActions({ failFinalizeFor: ['b.png'] });
    render(<BugReportForm actions={actions} />);
    await fill();
    await userEvent.upload(input(), [pngFile('a.png'), pngFile('b.png')]);
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    const alert = await screen.findByText(/Your report was sent, but 1 screenshot/);
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('Upload check failed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send report' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('What went wrong?')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Choose screenshots' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Retry b.png' }));
    expect(await screen.findByText('Thanks — we got it')).toBeInTheDocument();
    expect(actions.createBugReport).toHaveBeenCalledTimes(1);
  });

  it('finishes when the failed screenshot is removed instead', async () => {
    const actions = fakeActions({ failFinalizeFor: ['b.png'] });
    render(<BugReportForm actions={actions} />);
    await fill();
    await userEvent.upload(input(), [pngFile('b.png')]);
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    await screen.findByText(/Your report was sent/);
    await userEvent.click(screen.getByRole('button', { name: 'Remove b.png' }));
    expect(await screen.findByText('Thanks — we got it')).toBeInTheDocument();
  });

  it('shows the rate limit message', async () => {
    const actions = fakeActions({
      create: { ok: false, error: { code: 'RATE_LIMITED', message: 'Please wait.' } },
    });
    render(<BugReportForm actions={actions} />);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Please wait.');
  });

  it('refuses non-images before uploading, and accepts pasted images', async () => {
    render(<BugReportForm actions={fakeActions()} />);
    fireEvent.change(input(), {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });
    expect(await screen.findByText(/isn't a PNG, JPEG, WebP or GIF image/)).toBeInTheDocument();

    const form = screen.getByLabelText('What went wrong?').closest('form')!;
    fireEvent.paste(form, { clipboardData: { files: [pngFile('pasted.png')], items: [] } });
    const list = await screen.findByRole('list', { name: 'Selected screenshots' });
    expect(within(list).getByText('pasted.png')).toBeInTheDocument();
  });
});
