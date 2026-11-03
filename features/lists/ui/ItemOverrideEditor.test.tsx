import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LIST_IDS, getItemsForList, getSong } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import { ENERGY_LEVELS, ENERGY_META, MISSING_CHORD, type ListItem } from '@/types/domain';

import {
  ALL_KEYS,
  FirstChords,
  ItemOverrideEditor,
  UploadPrompt,
  parseBpm,
  previewForKey,
  songEditHref,
} from './ItemOverrideEditor';

afterEach(cleanup);

// "Cause to Celebrate": keys D (primary) and C; the fixture item overrides BPM to 126.
const [first, , centerItem] = getItemsForList(LIST_IDS.bg41926) as [ListItem, ListItem, ListItem];
const song = getSong(first.songId);
const plain: ListItem = { ...first, overrideKey: null, overrideBpm: null, overrideEnergy: null };
const resolve = (item: ListItem) => resolveItemDisplay(getSong(item.songId), item);

function setup(item: ListItem = plain, keys = song.keys) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<ItemOverrideEditor resolved={resolve(item)} keys={keys} onChange={onChange} />);
  return { user, onChange };
}

describe('parseBpm', () => {
  it.each([
    ['', null],
    ['  ', null],
    ['120', 120],
    [' 20 ', 20],
    ['300', 300],
  ])('accepts %j', (raw, value) => {
    expect(parseBpm(raw)).toEqual({ ok: true, value });
  });

  it.each(['19', '301', '12.5', 'fast', '-80'])('rejects %j', (raw) => {
    expect(parseBpm(raw)).toEqual({ ok: false });
  });
});

describe('previewForKey', () => {
  const resolved = resolve(plain);

  it('uses the chosen key’s chords', () => {
    const p = previewForKey(resolved, song.keys, 'C');
    expect(p.key).toBe('C');
    expect(p.needsUpload).toBe(false);
    expect(Object.values(p.chords)).not.toContain(undefined);
  });

  it('shows X everywhere and asks for an upload for a key the song lacks', () => {
    const p = previewForKey(resolved, song.keys, 'E');
    expect(p).toEqual({
      key: 'E',
      chords: { intro: 'X', verse: 'X', chorus: 'X', bridge: 'X' },
      needsUpload: true,
    });
  });

  it('falls back to the primary key with no override', () => {
    expect(previewForKey(resolved, song.keys, null).key).toBe('D');
  });

  it('uses the resolved values when keys aren’t loaded', () => {
    const center = resolve(centerItem);
    expect(previewForKey(center, [], centerItem.overrideKey)).toEqual({
      key: 'C',
      chords: center.firstChords,
      needsUpload: true,
    });
    expect(previewForKey(center, [], 'G')).toMatchObject({ key: 'G', needsUpload: false });
    expect(previewForKey(center, [], 'G').chords.intro).toBe(MISSING_CHORD);
  });
});

describe('ItemOverrideEditor', () => {
  it('offers the usual key, keys with chords, then every other key', () => {
    setup();
    const select = screen.getByLabelText('Key');
    expect(within(select).getByRole('option', { name: 'Usual key (D)' })).toHaveValue('');
    const withChords = within(select).getByRole('group', { name: 'Keys with chords' });
    expect(
      within(withChords)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['D', 'C']);
    const other = within(select).getByRole('group', { name: 'Other keys' });
    expect(within(other).getAllByRole('option')).toHaveLength(ALL_KEYS.length - 2);
  });

  it('overriding to a key the song lacks shows X chords and the upload link', async () => {
    const { user, onChange } = setup();
    await user.selectOptions(screen.getByLabelText('Key'), 'E');
    expect(onChange).toHaveBeenCalledWith({ overrideKey: 'E' });
    expect(screen.getByRole('heading', { name: 'First chords in E' })).toBeInTheDocument();
    expect(screen.getAllByText('X')).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Upload files for E' })).toHaveAttribute(
      'href',
      songEditHref(song.id),
    );
  });

  it('going back to the usual key clears the override', async () => {
    const { user, onChange } = setup({ ...plain, overrideKey: 'C' });
    await user.selectOptions(screen.getByLabelText('Key'), '');
    expect(onChange).toHaveBeenCalledWith({ overrideKey: null });
  });

  it('keeps an unusual saved key selectable', () => {
    setup({ ...plain, overrideKey: 'A#' });
    expect(screen.getByLabelText('Key')).toHaveValue('A#');
  });

  it('saves BPM on Enter and on blur, and clears it when emptied', async () => {
    const { user, onChange } = setup();
    const bpm = screen.getByLabelText('BPM');
    expect(bpm).toHaveAttribute('placeholder', `Usual: ${song.tempoBpm}`);
    await user.type(bpm, '132{Enter}');
    expect(onChange).toHaveBeenLastCalledWith({ overrideBpm: 132 });
    onChange.mockClear();
    await user.tab();
    expect(onChange).not.toHaveBeenCalled(); // already sent on Enter
    cleanup();

    const second = setup(first);
    await second.user.clear(screen.getByLabelText('BPM'));
    await second.user.tab();
    expect(second.onChange).toHaveBeenCalledWith({ overrideBpm: null });
  });

  it('rejects a BPM out of range', async () => {
    const { user, onChange } = setup();
    const bpm = screen.getByLabelText('BPM');
    await user.type(bpm, '999{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(bpm).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/whole number from 20 to 300/i)).toBeInTheDocument();
  });

  it('labels energy exactly as ENERGY_META and saves a choice', async () => {
    const { user, onChange } = setup();
    const select = screen.getByLabelText('Energy');
    for (const level of ENERGY_LEVELS) {
      expect(within(select).getByRole('option', { name: ENERGY_META[level].label })).toHaveValue(
        level,
      );
    }
    await user.selectOptions(select, 'quiet_worship');
    expect(onChange).toHaveBeenCalledWith({ overrideEnergy: 'quiet_worship' });
    expect(select).toHaveValue('quiet_worship');
  });

  it('resets every override at once', async () => {
    const { user, onChange } = setup(first);
    await user.click(screen.getByRole('button', { name: /usual values/i }));
    expect(onChange).toHaveBeenCalledWith({
      overrideKey: null,
      overrideBpm: null,
      overrideEnergy: null,
    });
  });

  it('hides reset when nothing is overridden', () => {
    setup();
    expect(screen.queryByRole('button', { name: /usual values/i })).not.toBeInTheDocument();
  });

  it('works without loaded keys', () => {
    setup(centerItem, []);
    const select = screen.getByLabelText('Key');
    expect(within(select).getByRole('group', { name: 'Keys' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Upload files for C' })).toBeInTheDocument();
  });
});

describe('UploadPrompt', () => {
  it('can leave out the link', () => {
    render(<UploadPrompt songId={song.id} songKey="Bb" linked={false} />);
    expect(screen.getByText('No chords or files for B♭ yet.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('FirstChords (LIST-10)', () => {
  it('leads with a visible "First chords" label so slots don’t read as section keys', () => {
    const { container } = render(
      <FirstChords chords={{ intro: 'D', verse: 'D', chorus: 'G', bridge: MISSING_CHORD }} />,
    );
    expect(screen.getByText('First chords')).toBeVisible();
    const list = container.querySelector<HTMLElement>('dl[aria-label="First chords"]')!;
    expect(
      within(list)
        .getAllByRole('term')
        .map((t) => t.textContent),
    ).toEqual(['Intro', 'Verse', 'Chorus', 'Bridge']);
    expect(within(list).getByLabelText('X, not known')).toBeInTheDocument();
  });
});
