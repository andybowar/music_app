import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// Sonner's Toaster needs matchMedia, which jsdom lacks.
vi.mock('@/components/ui/sonner', () => ({ Toaster: () => null }));

import { AdminBranchesGallery, createFakeBranchApi, galleryBranches } from './AdminBranchesGallery';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(cleanup);

const byCode = (code: string) => {
  const b = galleryBranches.find((x) => x.code === code);
  if (!b) throw new Error(`no fixture branch ${code}`);
  return b;
};

describe('createFakeBranchApi', () => {
  it('rejects a duplicate code with a field error, case-insensitively', async () => {
    const { onSave } = createFakeBranchApi(galleryBranches);
    const result = await onSave({ name: 'New branch', code: 'sv' });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT', fieldErrors: { code: ['Another branch already uses this code'] } },
    });
  });

  it('creates and updates branches, upper-casing the code', async () => {
    const { onSave } = createFakeBranchApi(galleryBranches);
    const created = await onSave({ name: 'Bay Area', code: 'ba', ssoGroup: '' });
    expect(created).toMatchObject({ ok: true, data: { code: 'BA', ssoGroup: null } });
    const rockford = byCode('RF');
    const renamed = await onSave({ id: rockford.id, name: 'Rockford IL', code: 'RF' });
    expect(renamed).toMatchObject({ ok: true, data: { id: rockford.id, name: 'Rockford IL' } });
  });

  it('refuses to delete a branch in use and deletes an unused one', async () => {
    const { onDelete } = createFakeBranchApi(galleryBranches);
    expect(await onDelete(byCode('SV').id)).toMatchObject({
      ok: false,
      error: { code: 'CONFLICT' },
    });
    expect(await onDelete(byCode('RF').id)).toEqual({ ok: true, data: undefined });
    expect(await onDelete(byCode('RF').id)).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });
});

describe('AdminBranchesGallery', () => {
  it('shows in-use and unused fixture branches, then the empty state', async () => {
    render(<AdminBranchesGallery />);
    expect(screen.getAllByRole('listitem')).toHaveLength(galleryBranches.length);
    // Two in use (Servant, Portland), two unused (CO Springs, Rockford).
    expect(screen.getAllByText('Nothing yet')).toHaveLength(2);
    expect(screen.getByText('3 users, 1 song, 2 lists, 12 usage entries')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('State'), 'empty');
    expect(screen.getByText('No branches yet. Add one to get started.')).toBeInTheDocument();
  });
});
