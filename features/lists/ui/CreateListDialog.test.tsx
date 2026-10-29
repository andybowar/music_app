import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { lists } from '@/fixtures';
import type { ActionResult, List, ListType } from '@/types/domain';
import type { ListInput } from '@/types/validation';

import {
  CreateListDialog,
  nextLordsDay,
  suggestListName,
  validateListInput,
} from './CreateListDialog';

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

const fixtureList = lists[0] as List;

function created(input: ListInput): List {
  return { ...fixtureList, type: input.type, name: input.name, eventDate: input.eventDate };
}

beforeAll(() => {
  // Radix touches APIs jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

beforeEach(() => {
  // Wednesday 15 April 2026 (local); the next Lord's Day is 19 April.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 3, 15, 10, 0, 0));
  toastMock.success.mockReset();
  toastMock.error.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Submit = (input: ListInput) => Promise<ActionResult<List>>;

/** Stateful harness: an opener button plus the dialog, like NavBar would use it. */
function Harness({
  type = 'setlist',
  onSubmit,
  onOpenChange,
}: {
  type?: ListType;
  onSubmit: Submit;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <CreateListDialog
        type={type}
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        onSubmit={onSubmit}
      />
    </>
  );
}

async function openDialog(props: Parameters<typeof Harness>[0]) {
  const user = userEvent.setup();
  render(<Harness {...props} />);
  const opener = screen.getByRole('button', { name: 'Open dialog' });
  await user.click(opener);
  const dialog = await screen.findByRole('dialog');
  return {
    user,
    opener,
    dialog,
    date: screen.getByLabelText(/event date/i) as HTMLInputElement,
    name: screen.getByLabelText(/^name$/i) as HTMLInputElement,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('helpers', () => {
  it('nextLordsDay returns today on a Sunday and the coming Sunday otherwise', () => {
    expect(nextLordsDay(new Date(2026, 3, 19))).toBe('2026-04-19');
    expect(nextLordsDay(new Date(2026, 3, 15))).toBe('2026-04-19');
    expect(nextLordsDay(new Date(2026, 3, 20))).toBe('2026-04-26');
    expect(nextLordsDay(new Date(2026, 11, 28))).toBe('2027-01-03');
  });

  it('suggestListName formats M/D/YY by list type and weekday', () => {
    expect(suggestListName('setlist', '2026-04-19')).toBe("Lord's Day 4/19/26");
    expect(suggestListName('setlist', '2026-04-25')).toBe('Setlist 4/25/26');
    expect(suggestListName('playlist', '2026-04-19')).toBe('Playlist 4/19/26');
    expect(suggestListName('setlist', '2005-01-02')).toBe("Lord's Day 1/2/05");
    expect(suggestListName('setlist', '')).toBe('');
    expect(suggestListName('setlist', '2026-02-30')).toBe('');
    expect(suggestListName('setlist', 'nope')).toBe('');
  });

  it('validateListInput accepts valid input and trims the name', () => {
    expect(validateListInput({ type: 'setlist', name: '  BG  ', eventDate: '2026-04-19' })).toEqual(
      { ok: true, data: { type: 'setlist', name: 'BG', eventDate: '2026-04-19' } },
    );
    expect(validateListInput({ type: 'playlist', name: 'Car rides', eventDate: '' })).toEqual({
      ok: true,
      data: { type: 'playlist', name: 'Car rides', eventDate: null },
    });
  });

  it('validateListInput reports friendly field errors', () => {
    expect(validateListInput({ type: 'setlist', name: ' ', eventDate: '' })).toEqual({
      ok: false,
      fieldErrors: { name: ['Enter a name'], eventDate: ['A setlist needs a date'] },
    });
    expect(validateListInput({ type: 'playlist', name: 'x'.repeat(121), eventDate: '' })).toEqual({
      ok: false,
      fieldErrors: { name: ['Name must be 120 characters or fewer'] },
    });
    expect(validateListInput({ type: 'playlist', name: 'x', eventDate: '2026-13-01' })).toEqual({
      ok: false,
      fieldErrors: { eventDate: ['Enter a valid date'] },
    });
  });
});

describe('CreateListDialog', () => {
  it('renders nothing while closed', () => {
    render(
      <CreateListDialog type="setlist" open={false} onOpenChange={vi.fn()} onSubmit={vi.fn()} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('prefills a setlist with the next Lord’s Day and a suggested name, and submits it', async () => {
    const onSubmit = vi.fn<Submit>(async (input) => ({ ok: true, data: created(input) }));
    const onOpenChange = vi.fn();
    const { user, dialog, date, name } = await openDialog({ onSubmit, onOpenChange });

    expect(dialog).toHaveAccessibleName('Create event setlist');
    expect(date).toHaveValue('2026-04-19');
    expect(date).toBeRequired();
    expect(name).toHaveValue("Lord's Day 4/19/26");

    await user.click(screen.getByRole('button', { name: 'Create setlist' }));

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'setlist',
      name: "Lord's Day 4/19/26",
      eventDate: '2026-04-19',
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(toastMock.success).toHaveBeenCalledWith("Setlist “Lord's Day 4/19/26” created");
  });

  it('follows the date with its suggestion until the name is edited', async () => {
    const onSubmit = vi.fn<Submit>();
    const { user, date, name } = await openDialog({ onSubmit });

    fireEvent.change(date, { target: { value: '2026-04-26' } });
    expect(name).toHaveValue("Lord's Day 4/26/26");
    fireEvent.change(date, { target: { value: '2026-04-24' } });
    expect(name).toHaveValue('Setlist 4/24/26');

    await user.clear(name);
    await user.type(name, 'Prayer meeting');
    fireEvent.change(date, { target: { value: '2026-05-03' } });
    expect(name).toHaveValue('Prayer meeting');

    await user.click(screen.getByRole('button', { name: "Use “Lord's Day 5/3/26”" }));
    expect(name).toHaveValue("Lord's Day 5/3/26");
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull();
  });

  it('shows client validation inline and does not call the action', async () => {
    const onSubmit = vi.fn<Submit>();
    const { user, date, name } = await openDialog({ onSubmit });

    fireEvent.change(date, { target: { value: '' } });
    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Create setlist' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(date).toHaveAttribute('aria-invalid', 'true');
    expect(date).toHaveAccessibleDescription('A setlist needs a date');
    expect(name).toHaveAccessibleDescription('Enter a name');
    expect(date).toHaveFocus();

    // Editing a field clears its error.
    await user.type(name, 'BG');
    expect(name).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Enter a name')).toBeNull();
    expect(screen.getByText('A setlist needs a date')).toBeInTheDocument();
  });

  it('shows ActionResult fieldErrors inline, with unknown fields at form level', async () => {
    const onSubmit = vi.fn<Submit>(async () => ({
      ok: false,
      error: {
        code: 'VALIDATION',
        message: 'Invalid input.',
        fieldErrors: {
          name: ['Already taken'],
          eventDate: ['Too far ahead'],
          type: ['Unsupported type'],
        },
      },
    }));
    const { user, dialog, date, name } = await openDialog({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Create setlist' }));

    expect(await screen.findByText('Already taken')).toBeInTheDocument();
    expect(name).toHaveAccessibleDescription('Already taken');
    expect(date).toHaveAccessibleDescription('Too far ahead');
    expect(screen.getByRole('alert')).toHaveTextContent('Unsupported type');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Invalid input.');
    expect(dialog).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalledWith('Invalid input.');
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('shows a non-field ActionResult error at form level and stays open', async () => {
    const onSubmit = vi.fn<Submit>(async () => ({
      ok: false,
      error: { code: 'FORBIDDEN', message: 'You do not have permission to create lists.' },
    }));
    const { user } = await openDialog({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Create setlist' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You do not have permission to create lists.',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('turns a rejected action into a generic error', async () => {
    const onSubmit = vi.fn<Submit>(async () => {
      throw new Error('network');
    });
    const { user } = await openDialog({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Create setlist' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong. Please try again.',
    );
    expect(screen.getByRole('button', { name: 'Create setlist' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('shows a loading state, ignores double submits and Esc while saving', async () => {
    const pending = deferred<ActionResult<List>>();
    const onSubmit = vi.fn<Submit>(() => pending.promise);
    const onOpenChange = vi.fn();
    const { user, date, name } = await openDialog({ onSubmit, onOpenChange });

    await user.click(screen.getByRole('button', { name: 'Create setlist' }));
    const busy = screen.getByRole('button', { name: 'Creating…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).toHaveFocus();
    expect(date).toBeDisabled();
    expect(name).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await user.click(busy);
    await user.keyboard('{Escape}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    pending.resolve({
      ok: true,
      data: created({ type: 'setlist', name: 'x', eventDate: '2026-04-19' }),
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('creates a playlist with no date', async () => {
    const onSubmit = vi.fn<Submit>(async (input) => ({ ok: true, data: created(input) }));
    const { user, dialog, date, name } = await openDialog({ type: 'playlist', onSubmit });

    expect(dialog).toHaveAccessibleName('Create listening playlist');
    expect(date).toHaveValue('');
    expect(date).not.toBeRequired();
    expect(name).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Create playlist' }));
    expect(screen.getByText('Enter a name')).toBeInTheDocument();
    expect(name).toHaveFocus();

    await user.type(name, 'Car rides');
    await user.click(screen.getByRole('button', { name: 'Create playlist' }));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'playlist', name: 'Car rides', eventDate: null });
    expect(toastMock.success).toHaveBeenCalledWith('Playlist “Car rides” created');
  });

  it('suggests a playlist name once a date is picked', async () => {
    const { date, name } = await openDialog({ type: 'playlist', onSubmit: vi.fn<Submit>() });
    fireEvent.change(date, { target: { value: '2026-04-19' } });
    expect(name).toHaveValue('Playlist 4/19/26');
  });

  describe('keyboard', () => {
    it('focuses the first field, traps Tab, closes on Esc and returns focus', async () => {
      const onOpenChange = vi.fn();
      const { user, opener, dialog, date } = await openDialog({
        onSubmit: vi.fn<Submit>(),
        onOpenChange,
      });

      await waitFor(() => expect(date).toHaveFocus());

      // Tab through every control; focus must never leave the dialog.
      for (let i = 0; i < 8; i++) {
        await user.tab();
        expect(dialog).toContainElement(document.activeElement as HTMLElement);
      }
      for (let i = 0; i < 8; i++) {
        await user.tab({ shift: true });
        expect(dialog).toContainElement(document.activeElement as HTMLElement);
      }

      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(onOpenChange).toHaveBeenLastCalledWith(false);
      await waitFor(() => expect(opener).toHaveFocus());
    });

    it('submits with Enter and Cancel closes', async () => {
      const onSubmit = vi.fn<Submit>(async (input) => ({ ok: true, data: created(input) }));
      const { user, opener, name } = await openDialog({ onSubmit });

      await user.click(name);
      await user.keyboard('{Enter}');
      expect(onSubmit).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await waitFor(() => expect(opener).toHaveFocus());

      await user.click(opener);
      await user.click(await screen.findByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('starts fresh each time it opens', async () => {
      const { user, opener, name } = await openDialog({ onSubmit: vi.fn<Submit>() });
      await user.clear(name);
      await user.type(name, 'Draft');
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

      await user.click(opener);
      expect(await screen.findByLabelText(/^name$/i)).toHaveValue("Lord's Day 4/19/26");
    });
  });
});
