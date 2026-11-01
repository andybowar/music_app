import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { branches as fixtureBranches } from '@/fixtures';
import type { AdminBranch, BranchInput } from '@/features/admin/server';
import type { ActionResult } from '@/types/domain';

import { BranchesAdmin, describeReferences, type BranchesAdminProps } from './BranchesAdmin';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const NONE = { users: 0, songs: 0, lists: 0, usage: 0 };

function adminBranch(i: number, references = NONE): AdminBranch {
  const base = fixtureBranches[i];
  if (!base) throw new Error(`fixture branch ${i} missing`);
  return { ...base, references };
}

const servant = adminBranch(0, { users: 3, songs: 1, lists: 0, usage: 12 }); // SV, in use
const portland = adminBranch(1); // OR, unused

const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });

function setup(props: Partial<BranchesAdminProps> = {}) {
  const handlers = {
    onSave: vi.fn(async (input: BranchInput): Promise<ActionResult<AdminBranch>> =>
      ok({
        id: input.id ?? '10000000-0000-4000-8000-000000000099',
        name: input.name,
        code: input.code,
        ssoGroup: input.ssoGroup ?? null,
        references: NONE,
      }),
    ),
    onDelete: vi.fn(async (): Promise<ActionResult<void>> => ok(undefined)),
  };
  render(<BranchesAdmin branches={[portland, servant]} {...handlers} {...props} />);
  return { user: userEvent.setup(), ...handlers };
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('describeReferences', () => {
  it('lists non-zero counts with singular/plural, or null when unused', () => {
    expect(describeReferences(NONE)).toBeNull();
    expect(describeReferences({ users: 1, songs: 2, lists: 1, usage: 1 })).toBe(
      '1 user, 2 songs, 1 list, 1 usage entry',
    );
    expect(describeReferences({ ...NONE, usage: 4 })).toBe('4 usage entries');
  });
});

describe('BranchesAdmin', () => {
  it('lists branches with code, SSO group and usage', () => {
    setup();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    const sv = within(rows[1] as HTMLElement);
    expect(sv.getByText('SV')).toBeInTheDocument();
    expect(sv.getByText('pop-branch-sv')).toBeInTheDocument();
    expect(sv.getByText('3 users, 1 song, 12 usage entries')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('Nothing yet')).toBeInTheDocument();
  });

  it('shows an empty state with no branches', () => {
    setup({ branches: [] });
    expect(screen.getByText('No branches yet. Add one to get started.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add branch' })).toBeEnabled();
  });

  it('adds a branch, with the code upper-cased and a blank SSO group sent as null', async () => {
    const { user, onSave } = setup();
    await user.click(screen.getByRole('button', { name: 'Add branch' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add a branch' });
    await user.type(within(dialog).getByLabelText('Name'), 'Rockford');
    await user.type(within(dialog).getByLabelText('Code'), 'rf');
    await user.click(within(dialog).getByRole('button', { name: 'Add branch' }));

    expect(onSave).toHaveBeenCalledWith({ name: 'Rockford', code: 'RF', ssoGroup: null });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(toastMock.success).toHaveBeenCalledWith('Rockford added');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Portland'),
      expect.stringContaining('Rockford'),
      expect.stringContaining('Servant'),
    ]);
  });

  it('edits a branch starting from its values', async () => {
    const { user, onSave } = setup();
    await user.click(screen.getByRole('button', { name: 'Edit Servant' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit Servant' });
    expect(within(dialog).getByLabelText('Code')).toHaveValue('SV');
    const sso = within(dialog).getByLabelText('SSO group (optional)');
    expect(sso).toHaveValue('pop-branch-sv');
    await user.clear(sso);
    await user.type(sso, 'pop-sv');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(onSave).toHaveBeenCalledWith({
      id: servant.id,
      name: 'Servant',
      code: 'SV',
      ssoGroup: 'pop-sv',
    });
    expect(await screen.findByText('pop-sv')).toBeInTheDocument();
    expect(toastMock.success).toHaveBeenCalledWith('Servant updated');
  });

  it('shows a code uniqueness error inline and keeps the dialog open', async () => {
    const { user } = setup({
      onSave: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: 'CONFLICT' as const,
          message: 'Another branch already uses some of these values.',
          fieldErrors: { code: ['Another branch already uses this code'] },
        },
      })),
    });
    await user.click(screen.getByRole('button', { name: 'Edit Portland' }));
    const dialog = await screen.findByRole('dialog');
    const code = within(dialog).getByLabelText('Code');
    await user.clear(code);
    await user.type(code, 'SV');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    expect(await within(dialog).findByText('Another branch already uses this code')).toBeVisible();
    expect(code).toHaveAttribute('aria-invalid', 'true');
    expect(code).toHaveAccessibleDescription(/another branch already uses this code/i);
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/already uses some/);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it("can't delete a branch that's in use", () => {
    setup();
    const del = screen.getByRole('button', { name: 'Delete Servant' });
    expect(del).toBeDisabled();
    expect(del).toHaveAccessibleDescription('3 users, 1 song, 12 usage entries');
  });

  it('deletes an unused branch after confirming', async () => {
    const { user, onDelete } = setup();
    await user.click(screen.getByRole('button', { name: 'Delete Portland' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete Portland?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    expect(onDelete).toHaveBeenCalledWith(portland.id);
    await waitFor(() => expect(screen.queryByText('Portland')).not.toBeInTheDocument());
    expect(toastMock.success).toHaveBeenCalledWith('Portland deleted');
  });

  it('keeps the branch and shows a toast when the delete fails', async () => {
    const { user } = setup({
      onDelete: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: 'CONFLICT' as const,
          message: "Portland is in use, so it can't be deleted.",
        },
      })),
    });
    await user.click(screen.getByRole('button', { name: 'Delete Portland' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith("Portland is in use, so it can't be deleted."),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // The open modal hides the page from the accessibility tree.
    expect(screen.getAllByRole('listitem', { hidden: true })).toHaveLength(2);
  });
});
