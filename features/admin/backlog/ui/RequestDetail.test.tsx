import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RequestActions } from '../types';
import { makeImage, makeRequest, polyfillDom } from './testUtils';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('./requestActions', () => ({ SERVER_REQUEST_ACTIONS: {} }));

const { RequestDetail } = await import('./RequestDetail');

beforeAll(polyfillDom);
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const request = makeRequest({ images: [makeImage(1), makeImage(2), makeImage(3)] });

function actions(overrides: Partial<RequestActions> = {}): Partial<RequestActions> {
  return {
    updateRequest: vi.fn(async (_id, patch) => ({
      ok: true as const,
      data: { ...request, ...patch },
    })),
    deleteRequest: vi.fn(async () => ({ ok: true as const, data: undefined })),
    navigate: vi.fn(),
    ...overrides,
  };
}

describe('RequestDetail', () => {
  it('shows the title, kind, submitter and the description with its line breaks', () => {
    render(<RequestDetail request={request} actions={actions()} />);
    expect(screen.getByRole('heading', { name: 'Show capo position' })).toBeInTheDocument();
    expect(screen.getByText('Enhancement')).toBeInTheDocument();
    expect(screen.getByText(/Submitted by Ada Admin/)).toBeInTheDocument();
    const desc = screen.getByText(/First line/);
    expect(desc.textContent).toBe('First line\nSecond line');
    expect(desc).toHaveClass('whitespace-pre-wrap');
  });

  it('changes the status, rolling back on failure', async () => {
    const a = actions();
    render(<RequestDetail request={request} actions={a} />);
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'planned');
    expect(a.updateRequest).toHaveBeenCalledWith(request.id, { status: 'planned' });
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue('planned'));

    cleanup();
    const failing = actions({
      updateRequest: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'INTERNAL' as const, message: 'Nope.' },
      })),
    });
    render(<RequestDetail request={request} actions={failing} />);
    await userEvent.selectOptions(screen.getByLabelText('Status'), 'done');
    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue('new'));
    expect(toastMock.error).toHaveBeenCalled();
  });

  it('opens images full size; arrows move between them and Escape closes', async () => {
    render(<RequestDetail request={request} actions={actions()} />);
    const thumb = screen.getByRole('button', { name: 'Open screen-1.png full size' });
    await userEvent.click(thumb);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Image 1 of 3');
    expect(screen.getByRole('img', { name: 'Wireframe: screen-1.png' })).toBeInTheDocument();

    await userEvent.keyboard('{ArrowRight}');
    expect(dialog).toHaveTextContent('Image 2 of 3');
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(dialog).toHaveTextContent('Image 3 of 3'); // wraps
    await userEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(dialog).toHaveTextContent('Image 1 of 3');

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(thumb).toHaveFocus();
  });

  it('asks before deleting, then goes back to the list', async () => {
    const a = actions();
    render(<RequestDetail request={request} actions={a} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete this request?');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(a.deleteRequest).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete request' }));
    await waitFor(() => expect(a.navigate).toHaveBeenCalledWith('/admin/requests'));
    expect(a.deleteRequest).toHaveBeenCalledWith(request.id);
  });

  it('links to the edit page and says when there are no wireframes', () => {
    render(<RequestDetail request={makeRequest()} actions={actions()} />);
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      `/admin/requests/${request.id}/edit`,
    );
    expect(screen.getByText('No wireframes.')).toBeInTheDocument();
  });
});
