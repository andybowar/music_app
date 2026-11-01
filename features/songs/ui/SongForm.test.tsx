import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockViewport } from '@/components/ui/test-media';
import { branches, composers, thousandHallelujahs, users } from '@/fixtures';
import type { ActionResult, AppUser, SongKey } from '@/types/domain';

import { FORM_MESSAGES } from './form/toInput';
import type { SongFormActions } from './SongForm';
import type * as Sonner from 'sonner';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof Sonner>()),
  toast,
}));

const { SongForm, SongFormForbidden, SongFormSkeleton, LEAVE_MESSAGE, TAB_LABEL } =
  await import('./SongForm');
type Actions = SongFormActions;

beforeAll(() => {
  // cmdk / Radix need these, jsdom doesn't ship them.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
  // ResponsivePanel / sonner read media queries; jsdom has no matchMedia.
  mockViewport(1280);
});
afterEach(() => {
  vi.restoreAllMocks();
});

const NEW_ID = '40000000-0000-4000-8000-0000000000aa';
const contributor = users.find((u) => u.role === 'contributor' && !u.disabledAt) as AppUser;
const ok = <T,>(data: T): ActionResult<T> => ({ ok: true, data });
const brooke = composers.find((c) => c.name === 'Brooke Ligertwood')!;

function fakeActions(overrides: Partial<Actions> = {}): Actions {
  const keys = (songId: string): SongKey[] => [
    {
      id: '50000000-0000-4000-8000-0000000000a1',
      songId,
      key: 'Eb',
      isPrimary: true,
      firstChords: { intro: null, verse: null, chorus: null, bridge: null },
    },
  ];
  return {
    createSong: vi.fn(async () => ok({ id: NEW_ID })),
    updateSong: vi.fn(async () => ok(undefined)),
    setSongKeys: vi.fn(async (songId: string) => ok(keys(songId))),
    setSongThemes: vi.fn(async () => ok(undefined)),
    setBranchUsage: vi.fn(async () => ok(undefined)),
    searchComposers: vi.fn(async (prefix: string) =>
      composers.filter((c) => c.name.toLowerCase().includes(prefix.toLowerCase())),
    ),
    createComposer: vi.fn(),
    searchThemes: vi.fn(async () => []),
    createTheme: vi.fn(),
    requestUpload: vi.fn(),
    finalizeUpload: vi.fn(),
    deleteResource: vi.fn(),
    getSignedResourceUrl: vi.fn(),
    addLink: vi.fn(),
    updateLink: vi.fn(),
    ...overrides,
  };
}

function setup(props: Partial<Parameters<typeof SongForm>[0]> = {}) {
  const actions = props.actions ?? fakeActions();
  const user = userEvent.setup();
  render(
    <SongForm song={null} user={contributor} branches={branches} {...props} actions={actions} />,
  );
  return { user, actions };
}

const tab = (label: string) => screen.getByRole('tab', { name: new RegExp(`^${label}`) });
const panel = (label: string) => screen.getByRole('tabpanel', { name: new RegExp(`^${label}`) });
const status = () => screen.getByText(/Unsaved changes|All changes saved|Saving…/);

async function fillNewSong(user: ReturnType<typeof userEvent.setup>) {
  const basic = within(panel(TAB_LABEL.basic));
  await user.type(basic.getByLabelText('Title'), '1000 Hallelujahs');
  await user.click(basic.getByRole('button', { name: 'Add composer' }));
  await user.type(screen.getByLabelText('Search composers'), 'brooke');
  await user.click(await screen.findByRole('option', { name: /Brooke Ligertwood/ }));

  await user.click(tab(TAB_LABEL.musical));
  const musical = within(panel(TAB_LABEL.musical));
  await user.click(musical.getByRole('button', { name: 'Add key' }));
  await user.click(musical.getByRole('combobox', { name: 'Key' }));
  await user.click(screen.getByRole('option', { name: 'Eb' }));
}

describe('SongForm — new song', () => {
  it('shows every section as a tab, starting on basic info', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Add a song' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(Object.values(TAB_LABEL));
    expect(tab(TAB_LABEL.basic)).toHaveAttribute('aria-selected', 'true');
    expect(within(panel(TAB_LABEL.files)).getByText(/Save to add files/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/library');
  });

  it('checks the form before sending anything', async () => {
    const { user, actions } = setup();
    await user.click(tab(TAB_LABEL.lyrics));
    await user.click(screen.getByRole('button', { name: 'Add song' }));
    expect(actions.createSong).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Check the highlighted fields.');
    // Jumps to the first tab with errors and marks the others.
    expect(tab(TAB_LABEL.basic)).toHaveAttribute('aria-selected', 'true');
    expect(within(panel(TAB_LABEL.basic)).getByText(FORM_MESSAGES.title)).toBeInTheDocument();
    expect(within(panel(TAB_LABEL.basic)).getByText(FORM_MESSAGES.composers)).toBeInTheDocument();
    expect(tab(TAB_LABEL.musical)).toHaveTextContent('(has errors)');
    expect(tab(TAB_LABEL.lyrics)).not.toHaveTextContent('(has errors)');
  });

  it('creates the song, saves its keys and opens the edit form on files', async () => {
    const { user, actions } = setup();
    await fillNewSong(user);
    expect(status()).toHaveTextContent('Unsaved changes');
    await user.click(screen.getByRole('button', { name: 'Add song' }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(`/songs/${NEW_ID}/edit?created=1`),
    );
    expect(actions.createSong).toHaveBeenCalledWith(
      expect.objectContaining({ title: '1000 Hallelujahs', composerIds: [brooke.id] }),
    );
    expect(actions.setSongKeys).toHaveBeenCalledWith(NEW_ID, [
      {
        key: 'Eb',
        isPrimary: true,
        firstChords: { intro: null, verse: null, chorus: null, bridge: null },
      },
    ]);
    expect(actions.setSongThemes).not.toHaveBeenCalled();
    expect(actions.setBranchUsage).not.toHaveBeenCalled();
  });

  it('shows server field errors on their tab', async () => {
    const actions = fakeActions({
      createSong: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: 'VALIDATION' as const,
          message: 'Invalid input.',
          fieldErrors: { tempoBpm: ['Tempo is off'] },
        },
      })),
    });
    const { user } = setup({ actions });
    await fillNewSong(user);
    await user.click(tab(TAB_LABEL.basic));
    await user.click(screen.getByRole('button', { name: 'Add song' }));
    await waitFor(() => expect(tab(TAB_LABEL.musical)).toHaveAttribute('aria-selected', 'true'));
    expect(within(panel(TAB_LABEL.musical)).getByText('Tempo is off')).toBeInTheDocument();
    expect(toast.error).toHaveBeenCalledWith('Couldn’t save. Check the highlighted fields.');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('after a partial create, the next save updates instead of creating again', async () => {
    const setSongKeys = vi
      .fn<Actions['setSongKeys']>()
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'INTERNAL', message: 'Something went wrong.' },
      })
      .mockImplementation(async (songId) =>
        ok([
          {
            id: '50000000-0000-4000-8000-0000000000a1',
            songId,
            key: 'Eb',
            isPrimary: true,
            firstChords: { intro: null, verse: null, chorus: null, bridge: null },
          },
        ]),
      );
    const actions = fakeActions({ setSongKeys });
    const { user } = setup({ actions });
    await fillNewSong(user);
    await user.click(screen.getByRole('button', { name: 'Add song' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The song was added, but some details didn’t save. Fix them and save again.',
      ),
    );
    expect(within(panel(TAB_LABEL.musical)).getByText('Something went wrong.')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(status()).toHaveTextContent('Unsaved changes');

    await user.click(screen.getByRole('button', { name: 'Add song' }));
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(`/songs/${NEW_ID}/edit?created=1`),
    );
    expect(actions.createSong).toHaveBeenCalledOnce();
    expect(actions.updateSong).toHaveBeenCalledWith(NEW_ID, expect.anything());
    expect(setSongKeys).toHaveBeenCalledTimes(2);
  });
});

describe('SongForm — editing', () => {
  const song = thousandHallelujahs;

  it('loads the song and only saves what changed', async () => {
    const { user, actions } = setup({ song });
    expect(screen.getByRole('heading', { name: 'Edit song' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View song' })).toHaveAttribute(
      'href',
      `/songs/${song.id}`,
    );
    expect(within(panel(TAB_LABEL.basic)).getByLabelText('Title')).toHaveValue(song.title);
    expect(status()).toHaveTextContent('All changes saved');

    const title = within(panel(TAB_LABEL.basic)).getByLabelText('Title');
    await user.type(title, ' (live)');
    expect(status()).toHaveTextContent('Unsaved changes');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Song saved'));
    expect(actions.updateSong).toHaveBeenCalledWith(
      song.id,
      expect.objectContaining({ title: `${song.title} (live)` }),
    );
    expect(actions.setSongKeys).not.toHaveBeenCalled();
    expect(actions.setSongThemes).not.toHaveBeenCalled();
    expect(actions.setBranchUsage).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalled();
    expect(status()).toHaveTextContent('All changes saved');
  });

  it('shows message-only server errors above the form', async () => {
    const actions = fakeActions({
      updateSong: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'NOT_FOUND' as const, message: 'Song not found.' },
      })),
    });
    const { user } = setup({ song, actions });
    await user.type(within(panel(TAB_LABEL.basic)).getByLabelText('Title'), '!');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Song not found.');
    expect(status()).toHaveTextContent('Unsaved changes');
  });

  it('opens the requested tab and shows a notice', () => {
    setup({ song, initialTab: 'files', notice: 'Song added.' });
    expect(tab(TAB_LABEL.files)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Song added.')).toBeInTheDocument();
  });

  it('ignores an unknown tab', () => {
    setup({ song, initialTab: 'nope' });
    expect(tab(TAB_LABEL.basic)).toHaveAttribute('aria-selected', 'true');
  });

  it('steps through the tabs with Next', async () => {
    const { user } = setup({ song });
    await user.click(screen.getByRole('button', { name: `Next: ${TAB_LABEL.musical}` }));
    expect(tab(TAB_LABEL.musical)).toHaveAttribute('aria-selected', 'true');
    await user.click(tab(TAB_LABEL.files));
    expect(screen.queryByRole('button', { name: /^Next:/ })).toBeNull();
  });
});

describe('SongForm — leave guard', () => {
  const song = thousandHallelujahs;
  const unload = () => {
    const e = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  };

  it('does nothing while the form is clean', () => {
    const confirm = vi.spyOn(window, 'confirm');
    setup({ song });
    expect(unload()).toBe(false);
    fireEvent.click(screen.getByRole('link', { name: 'View song' }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before leaving with unsaved changes', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { user } = setup({ song });
    await user.type(within(panel(TAB_LABEL.basic)).getByLabelText('Title'), '!');
    expect(unload()).toBe(true);

    const link = screen.getByRole('link', { name: 'View song' });
    expect(fireEvent.click(link)).toBe(false);
    expect(confirm).toHaveBeenCalledWith(LEAVE_MESSAGE);

    confirm.mockReturnValue(true);
    fireEvent.click(link);
    expect(confirm).toHaveBeenCalledTimes(2);

    // Modified clicks, new tabs and same-page links aren't intercepted.
    fireEvent.click(link, { metaKey: true });
    const extra = document.createElement('a');
    extra.href = '#lyrics';
    extra.textContent = 'hash';
    document.body.append(extra);
    fireEvent.click(extra);
    extra.href = 'https://example.com/elsewhere';
    fireEvent.click(extra);
    extra.href = '/library';
    extra.target = '_blank';
    fireEvent.click(extra);
    extra.remove();
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});

describe('page states', () => {
  it('forbidden explains who can edit songs', () => {
    render(<SongFormForbidden />);
    expect(screen.getByText('403')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /don.t have access/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the library' })).toHaveAttribute(
      'href',
      '/library',
    );
  });

  it('skeleton announces loading', () => {
    render(<SongFormSkeleton />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading song form…');
  });
});
