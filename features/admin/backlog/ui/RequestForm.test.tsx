import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/types/domain';

import type { FeatureRequest, FeatureRequestImage, RequestActions } from '../types';
import { makeImage, makeRequest, pngFile, polyfillDom } from './testUtils';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('./requestActions', () => ({ SERVER_REQUEST_ACTIONS: {} }));

const { RequestForm } = await import('./RequestForm');

beforeAll(polyfillDom);
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const REQ = makeRequest();

function fakeActions(opts: { failFinalizeFor?: string[] } = {}) {
  const failing = new Set(opts.failFinalizeFor ?? []);
  let n = 0;
  const actions: RequestActions = {
    createRequest: vi.fn(async (input) => ({
      ok: true as const,
      data: { ...REQ, ...input, description: input.description ?? '' },
    })),
    updateRequest: vi.fn(async (_id, patch) => ({ ok: true as const, data: { ...REQ, ...patch } })),
    deleteRequest: vi.fn(async () => ({ ok: true as const, data: undefined })),
    createRequestImageUpload: vi.fn(async (_id, input) => ({
      ok: true as const,
      data: { imageId: `pending:${input.fileName}`, uploadUrl: `https://up.test/${n++}` },
    })),
    finalizeRequestImage: vi.fn(async (pendingId): Promise<ActionResult<FeatureRequestImage>> => {
      const name = pendingId.replace('pending:', '');
      if (failing.has(name)) {
        failing.delete(name); // fails once, so Retry succeeds
        return { ok: false, error: { code: 'VALIDATION', message: 'Upload check failed.' } };
      }
      return { ok: true, data: { ...makeImage(1), fileName: name } };
    }),
    deleteRequestImage: vi.fn(async () => ({ ok: true as const, data: undefined })),
    putFile: vi.fn(async (_url, _file, onProgress) => onProgress(1)),
    navigate: vi.fn(),
  };
  return actions;
}

const input = () => screen.getByTestId('wireframe-input') as HTMLInputElement;

async function fill(title = 'Capo hints') {
  await userEvent.type(screen.getByLabelText('Title'), title);
}

describe('RequestForm', () => {
  it('shows validation errors inline and does not submit', async () => {
    const actions = fakeActions();
    render(<RequestForm actions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    expect(screen.getByText('Enter a title')).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'true');
    expect(actions.createRequest).not.toHaveBeenCalled();
  });

  it('shows server field errors inline', async () => {
    const actions = fakeActions();
    actions.createRequest = vi.fn(async () => ({
      ok: false as const,
      error: {
        code: 'VALIDATION' as const,
        message: 'Invalid input.',
        fieldErrors: { title: ['Too similar'] },
      },
    }));
    render(<RequestForm actions={actions} />);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    expect(await screen.findByText('Too similar')).toBeInTheDocument();
  });

  it('refuses unsupported files before uploading', async () => {
    const actions = fakeActions();
    render(<RequestForm actions={actions} />);
    const pdf = new File(['x'], 'spec.pdf', { type: 'application/pdf' });
    fireEvent.change(input(), { target: { files: [pdf] } });
    expect(screen.getByRole('alert')).toHaveTextContent("“spec.pdf” isn't a PNG");
    expect(screen.queryByRole('list', { name: 'Selected wireframes' })).not.toBeInTheDocument();
  });

  it('accepts dropped and pasted images', async () => {
    render(<RequestForm actions={fakeActions()} />);
    fireEvent.drop(screen.getByTestId('wireframe-dropzone'), {
      dataTransfer: { files: [pngFile('dropped.png')], items: [] },
    });
    fireEvent.paste(screen.getByLabelText('Title'), {
      clipboardData: { files: [pngFile('pasted.png')], items: [] },
    });
    const list = screen.getByRole('list', { name: 'Selected wireframes' });
    expect(within(list).getByText('dropped.png')).toBeInTheDocument();
    expect(within(list).getByText('pasted.png')).toBeInTheDocument();
    expect(screen.getByText('2 of 5 images')).toBeInTheDocument();
  });

  it('creates the request, uploads each image, then opens the detail page', async () => {
    const actions = fakeActions();
    render(<RequestForm actions={actions} />);
    await userEvent.click(screen.getByLabelText('Change'));
    await fill();
    fireEvent.change(input(), { target: { files: [pngFile('a.png'), pngFile('b.png')] } });
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    await waitFor(() => expect(actions.navigate).toHaveBeenCalledWith(`/admin/requests/${REQ.id}`));
    expect(actions.createRequest).toHaveBeenCalledWith({
      kind: 'change',
      title: 'Capo hints',
      description: '',
    });
    expect(actions.putFile).toHaveBeenCalledTimes(2);
    expect(actions.finalizeRequestImage).toHaveBeenCalledTimes(2);
  });

  it('keeps the request when an image fails, then retries just that image', async () => {
    const actions = fakeActions({ failFinalizeFor: ['b.png'] });
    render(<RequestForm actions={actions} />);
    await fill();
    fireEvent.change(input(), { target: { files: [pngFile('a.png'), pngFile('b.png')] } });
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));

    const notice = await screen.findByText(/The request was saved, but 1 image didn/);
    expect(notice).toHaveTextContent('b.png');
    expect(actions.navigate).not.toHaveBeenCalled();
    expect(screen.getByText('Upload check failed.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry b.png' }));
    await waitFor(() => expect(actions.navigate).toHaveBeenCalledWith(`/admin/requests/${REQ.id}`));
    expect(actions.createRequest).toHaveBeenCalledTimes(1);
    // a.png was not uploaded again.
    expect(actions.putFile).toHaveBeenCalledTimes(3);
  });

  it('lets a failed image be removed instead, and a resubmit updates rather than re-creates', async () => {
    const actions = fakeActions();
    actions.putFile = vi.fn(async () => {
      throw new Error('offline');
    });
    render(<RequestForm actions={actions} />);
    await fill();
    fireEvent.change(input(), { target: { files: [pngFile('a.png')] } });
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    expect(await screen.findByText('The upload was interrupted.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Remove a.png' }));
    expect(screen.queryByText('a.png')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    await waitFor(() => expect(actions.navigate).toHaveBeenCalled());
    expect(actions.createRequest).toHaveBeenCalledTimes(1);
    expect(actions.updateRequest).toHaveBeenCalledTimes(1);
  });

  it('disables submit while saving', async () => {
    const actions = fakeActions();
    let release!: () => void;
    actions.createRequest = vi.fn(
      () =>
        new Promise<ActionResult<FeatureRequest>>((resolve) => {
          release = () => resolve({ ok: true, data: REQ });
        }),
    );
    render(<RequestForm actions={actions} />);
    await fill();
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }));
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    release();
    await waitFor(() => expect(actions.navigate).toHaveBeenCalled());
  });

  it('edits an existing request and removes a saved image on save', async () => {
    const actions = fakeActions();
    const request = makeRequest({ images: [makeImage(1), makeImage(2)] });
    render(<RequestForm request={request} actions={actions} />);
    expect(screen.getByLabelText('Title')).toHaveValue('Show capo position');
    await userEvent.click(screen.getByRole('button', { name: 'Remove screen-1.png' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(actions.navigate).toHaveBeenCalledWith(`/admin/requests/${request.id}`),
    );
    expect(actions.updateRequest).toHaveBeenCalledWith(request.id, {
      kind: 'enhancement',
      title: 'Show capo position',
      description: 'First line\nSecond line',
    });
    expect(actions.deleteRequestImage).toHaveBeenCalledWith(makeImage(1).id);
    expect(actions.createRequest).not.toHaveBeenCalled();
  });
});
