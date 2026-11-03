import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/types/domain';

import type { AdminTodo, TodoActions } from '../types';
import { makeTodo, polyfillDom } from './testUtils';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/features/admin/backlog/server', () => ({
  addTodo: vi.fn(),
  updateTodo: vi.fn(),
  deleteTodo: vi.fn(),
}));

const { BacklogTodos } = await import('./BacklogTodos');

beforeAll(polyfillDom);
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const fail = { ok: false, error: { code: 'INTERNAL', message: 'Try again.' } } as const;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function fakeActions(): TodoActions & { calls: string[] } {
  let n = 100;
  const calls: string[] = [];
  return {
    calls,
    addTodo: vi.fn(async (input): Promise<ActionResult<AdminTodo>> => {
      calls.push(`add ${input.title}`);
      return { ok: true, data: makeTodo(n++, { title: input.title, notes: input.notes ?? null }) };
    }),
    updateTodo: vi.fn(async (id, patch): Promise<ActionResult<AdminTodo>> => {
      calls.push(`update ${patch.done}`);
      return {
        ok: true,
        data: makeTodo(1, { id, doneAt: patch.done ? '2026-11-02T00:00:00.000Z' : null }),
      };
    }),
    deleteTodo: vi.fn(async () => ({ ok: true as const, data: undefined })),
  };
}

describe('BacklogTodos', () => {
  it('shows the empty state', () => {
    render(<BacklogTodos todos={[]} actions={fakeActions()} />);
    expect(screen.getByText('No to-dos yet.')).toBeInTheDocument();
  });

  it('adds a to-do with Enter, optimistically', async () => {
    const actions = fakeActions();
    const gate = deferred<ActionResult<AdminTodo>>();
    actions.addTodo = vi.fn(() => gate.promise);
    render(<BacklogTodos todos={[]} actions={actions} />);

    await userEvent.type(screen.getByLabelText('New to-do'), 'Order capos{Enter}');
    // Shown before the server answers.
    expect(screen.getByText('Order capos')).toBeInTheDocument();
    expect(screen.getByLabelText('New to-do')).toHaveValue('');
    gate.resolve({ ok: true, data: makeTodo(7, { title: 'Order capos' }) });
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeEnabled());
    expect(actions.addTodo).toHaveBeenCalledWith({ title: 'Order capos' });
  });

  it('refuses a blank to-do inline', async () => {
    const actions = fakeActions();
    render(<BacklogTodos todos={[]} actions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByText('Enter a title')).toBeInTheDocument();
    expect(actions.addTodo).not.toHaveBeenCalled();
  });

  it('rolls back a failed add and restores the text', async () => {
    const actions = fakeActions();
    actions.addTodo = vi.fn(async () => fail);
    render(<BacklogTodos todos={[]} actions={actions} />);
    await userEvent.type(screen.getByLabelText('New to-do'), 'Nope{Enter}');
    await waitFor(() => expect(screen.getByText('No to-dos yet.')).toBeInTheDocument());
    expect(screen.getByLabelText('New to-do')).toHaveValue('Nope');
    expect(toastMock.error).toHaveBeenCalledWith(expect.stringContaining('Try again.'));
  });

  it('ticks a to-do into the collapsed Done section', async () => {
    const actions = fakeActions();
    render(<BacklogTodos todos={[makeTodo(1), makeTodo(2)]} actions={actions} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'To-do 1' }));
    const summary = screen.getByText('Done (1)');
    const details = summary.closest('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(within(details).getByText('To-do 1')).toBeInTheDocument();
    expect(actions.updateTodo).toHaveBeenCalledWith(makeTodo(1).id, { done: true });
  });

  it('rolls back a failed tick', async () => {
    const actions = fakeActions();
    actions.updateTodo = vi.fn(async () => fail);
    render(<BacklogTodos todos={[makeTodo(1)]} actions={actions} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'To-do 1' }));
    await waitFor(() => expect(screen.queryByText(/Done \(/)).not.toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'To-do 1' })).not.toBeChecked();
    expect(toastMock.error).toHaveBeenCalled();
  });

  it('deletes with an Undo toast that restores the to-do', async () => {
    const actions = fakeActions();
    render(<BacklogTodos todos={[makeTodo(1), makeTodo(2)]} actions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete “To-do 1”' }));
    expect(screen.queryByText('To-do 1')).not.toBeInTheDocument();
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled());
    const options = toastMock.success.mock.calls[0]![1] as { action: { onClick(): void } };
    options.action.onClick();
    await waitFor(() => expect(screen.getByText('To-do 1')).toBeInTheDocument());
    expect(actions.addTodo).toHaveBeenCalledWith({ title: 'To-do 1', notes: null });
    // Restored in its old place.
    const labels = screen.getAllByRole('checkbox').map((c) => c.getAttribute('id'));
    expect(labels).toHaveLength(2);
    expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('To-do 1');
  });

  it('puts a to-do back when the delete fails', async () => {
    const actions = fakeActions();
    actions.deleteTodo = vi.fn(async () => fail);
    render(<BacklogTodos todos={[makeTodo(1)]} actions={actions} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete “To-do 1”' }));
    await waitFor(() => expect(screen.getByText('To-do 1')).toBeInTheDocument());
    expect(toastMock.error).toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});
