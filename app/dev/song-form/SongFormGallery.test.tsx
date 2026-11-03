import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { mockViewport } from '@/components/ui/test-media';
import type { SongKeyInput } from '@/types/validation';

import { createFakeSongApi, type SaveMode } from './fakeSongApi';
import { SongFormGallery } from './SongFormGallery';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= function scrollIntoView() {};
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
});
beforeEach(() => mockViewport(1280));
afterEach(cleanup);

const KEY: SongKeyInput = { key: 'Eb', isPrimary: true } as SongKeyInput;
const SONG = { title: 'x' } as Parameters<ReturnType<typeof createFakeSongApi>['createSong']>[0];

describe('createFakeSongApi', () => {
  it('creates a song and returns keys with ids in success mode', async () => {
    const api = createFakeSongApi({ delayMs: 0 });
    const created = await api.createSong(SONG);
    expect(created.ok).toBe(true);
    const id = created.ok ? created.data.id : '';
    const keys = await api.setSongKeys(id, [KEY]);
    expect(keys).toMatchObject({ ok: true, data: [{ songId: id, key: 'Eb', isPrimary: true }] });
    expect(api.calls.map((c) => c.action)).toEqual(['createSong', 'setSongKeys']);
  });

  it('returns field errors from createSong and updateSong', async () => {
    const api = createFakeSongApi({ delayMs: 0, mode: () => 'field-errors' });
    for (const res of [await api.createSong(SONG), await api.updateSong('id', SONG)]) {
      expect(res).toMatchObject({
        ok: false,
        error: { fieldErrors: { tempoBpm: [expect.any(String)] } },
      });
    }
  });

  it('fails setSongKeys once after a create in partial mode, then succeeds', async () => {
    let mode: SaveMode = 'partial';
    const api = createFakeSongApi({ delayMs: 0, mode: () => mode });
    await api.createSong(SONG);
    expect((await api.setSongKeys('id', [KEY])).ok).toBe(false);
    expect((await api.setSongKeys('id', [KEY])).ok).toBe(true);
    mode = 'success';
    expect((await api.setSongThemes('id', [])).ok).toBe(true);
    expect((await api.setBranchUsage('id', [])).ok).toBe(true);
  });
});

describe('SongFormGallery', () => {
  it('starts on the new-song form', () => {
    render(<SongFormGallery />);
    expect(screen.getByRole('heading', { name: 'Add a song' })).toBeInTheDocument();
    expect(screen.getByText('No navigations yet.')).toBeInTheDocument();
  });

  it('records the refresh after saving the edit form instead of navigating', async () => {
    const user = userEvent.setup();
    render(<SongFormGallery />);
    await user.selectOptions(screen.getByLabelText('State'), 'edit');
    expect(screen.getByRole('heading', { name: 'Edit song' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('refresh()')).toBeInTheDocument();
  });

  it('shows the forbidden and loading states', async () => {
    const user = userEvent.setup();
    render(<SongFormGallery />);
    await user.selectOptions(screen.getByLabelText('State'), 'forbidden');
    expect(screen.getByText("You don't have access to this page")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('State'), 'loading');
    expect(screen.getByText('Loading song form…')).toBeInTheDocument();
  });
});
