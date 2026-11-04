import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LIST_IDS, SONG_IDS, getSong } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import type { ListItem, Resource } from '@/types/domain';

import type { PlayerRole } from './playerPrefs';
import { SetPlayer } from './SetPlayer';

vi.mock('./PdfPages', () => ({
  PdfPages: ({ url, onLoadSuccess }: { url: string; onLoadSuccess(n: number): void }) => {
    useEffect(() => onLoadSuccess(2), [onLoadSuccess]);
    return <div data-testid="pdf-pages">{url}</div>;
  },
}));

// jsdom has no layout: give elements a phone's width so the inline PDF renders.
const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 360,
  });
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
});

const CASES: Array<{ songId: string; overrideKey?: string }> = [
  { songId: SONG_IDS.amazingGrace },
  { songId: SONG_IDS.beExaltedOGod },
  { songId: SONG_IDS.holySpirit, overrideKey: 'E' },
  { songId: SONG_IDS.agnusDei },
  { songId: SONG_IDS.atTheCross },
  { songId: SONG_IDS.amazingGrace, overrideKey: 'A' },
];
const items = CASES.map((c, i) => {
  const item: ListItem = {
    id: `90000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    listId: LIST_IDS.bg41926,
    songId: c.songId,
    position: i,
    overrideKey: c.overrideKey ?? null,
    overrideBpm: null,
    overrideEnergy: null,
    resourceId: null,
    notes: null,
  };
  return resolveItemDisplay(getSong(c.songId), item);
});
// At the Cross has no details, like a song whose details failed to load.
const songs = [
  SONG_IDS.amazingGrace,
  SONG_IDS.beExaltedOGod,
  SONG_IDS.holySpirit,
  SONG_IDS.agnusDei,
].map(getSong);

function setup({
  role = 'vocalist' as PlayerRole,
  index = 0,
  getPdfUrl = vi.fn(async (r: Resource) => `blob:${r.id}`),
} = {}) {
  const onIndexChange = vi.fn();
  const onRoleChange = vi.fn();
  const onOpenResource = vi.fn();
  const onClose = vi.fn();
  function Harness() {
    const [state, setState] = useState({ index, role });
    return (
      <SetPlayer
        title="BG 4/19/26"
        items={items}
        songs={songs}
        index={state.index}
        onIndexChange={(i) => {
          onIndexChange(i);
          setState((s) => ({ ...s, index: i }));
        }}
        role={state.role}
        onRoleChange={(r) => {
          onRoleChange(r);
          setState((s) => ({ ...s, role: r }));
        }}
        getPdfUrl={getPdfUrl}
        onOpenResource={onOpenResource}
        onClose={onClose}
      />
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  return { user, onIndexChange, onRoleChange, onOpenResource, onClose, getPdfUrl };
}

const dialog = () => screen.getByRole('dialog', { name: /BG 4\/19\/26/ });
const scroller = () => screen.getByTestId('player-scroll');
const songTitle = () =>
  within(dialog())
    .getByText(/· Song \d of 6$/)
    .textContent!.replace(/^.*· /, '');

function sized(el: HTMLElement, { top = 0, height = 400, scrollHeight = 1000 } = {}) {
  Object.defineProperty(el, 'clientHeight', { value: height, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  el.scrollTop = top;
  el.scrollTo = vi.fn() as unknown as typeof el.scrollTo;
}

describe('SetPlayer shell', () => {
  it('is a labelled full-screen dialog with the song, its number and key', () => {
    setup();
    expect(dialog()).toBeVisible();
    expect(songTitle()).toBe('Song 1 of 6');
    expect(within(dialog()).getByText('Amazing Grace (My Chains Are Gone)')).toBeVisible();
    expect(screen.getByText('Next: Be Exalted, O God')).toBeVisible();
  });

  it('moves with buttons, keys and the live region; stops at both ends', async () => {
    const { user, onIndexChange } = setup();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /^Next/ }));
    expect(songTitle()).toBe('Song 2 of 6');
    expect(screen.getByText('Song 2 of 6: Be Exalted, O God')).toBeInTheDocument();
    fireEvent.keyDown(scroller(), { key: 'PageDown' });
    fireEvent.keyDown(scroller(), { key: 'ArrowRight' });
    expect(songTitle()).toBe('Song 4 of 6');
    fireEvent.keyDown(scroller(), { key: 'ArrowLeft' });
    fireEvent.keyDown(scroller(), { key: 'PageUp' });
    expect(songTitle()).toBe('Song 2 of 6');
    fireEvent.keyDown(scroller(), { key: 'ArrowRight', ctrlKey: true });
    expect(songTitle()).toBe('Song 2 of 6');
    onIndexChange.mockClear();
    for (let i = 0; i < 6; i++) fireEvent.keyDown(scroller(), { key: 'ArrowRight' });
    expect(songTitle()).toBe('Song 6 of 6');
    expect(screen.getByText('Last song')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Next/ })).toBeDisabled();
    expect(onIndexChange).toHaveBeenCalledTimes(4);
  });

  it('moves on a sideways swipe only', () => {
    setup({ index: 1 });
    const swipe = (dx: number, dy: number) => {
      fireEvent.pointerDown(scroller(), { clientX: 200, clientY: 200 });
      fireEvent.pointerUp(scroller(), { clientX: 200 + dx, clientY: 200 + dy });
    };
    swipe(-30, 0);
    swipe(-100, 90);
    expect(songTitle()).toBe('Song 2 of 6');
    swipe(-100, 10);
    expect(songTitle()).toBe('Song 3 of 6');
    swipe(100, 0);
    expect(songTitle()).toBe('Song 2 of 6');
  });

  it("the speed slider's arrow keys don't change song", async () => {
    setup();
    const slider = screen.getByRole('slider');
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(songTitle()).toBe('Song 1 of 6');
  });

  it('closes with the close button and Escape', async () => {
    const { user, onClose } = setup();
    await user.click(screen.getByRole('button', { name: 'Close the player' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('switches role from the menu, keeping the song', async () => {
    const { user, onRoleChange } = setup({ index: 2 });
    await user.click(screen.getByRole('button', { name: 'Viewing as Vocalist. Change role' }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Musician' }));
    expect(onRoleChange).toHaveBeenCalledWith('musician');
    expect(songTitle()).toBe('Song 3 of 6');
    expect(screen.getByRole('button', { name: 'Viewing as Musician. Change role' })).toBeVisible();
  });
});

describe('autoscroll and text size', () => {
  it('turns autoscroll off on every song change, with a speed per song', async () => {
    const { user } = setup();
    const toggle = screen.getByRole('button', { name: 'Autoscroll' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByRole('slider'), { target: { value: '8' } });
    expect(screen.getByRole('slider')).toHaveValue('8');

    await user.click(screen.getByRole('button', { name: /^Next/ }));
    expect(screen.getByRole('button', { name: 'Autoscroll' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('slider')).toHaveValue('3');
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole('slider')).toHaveValue('8');
  });

  it('A− / A+ change the lyric size, remembered on the device', async () => {
    const { user } = setup();
    const smaller = screen.getByRole('button', { name: 'Smaller text' });
    expect(smaller).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Larger text' }));
    expect(screen.getAllByText(/Amazing grace, how sweet the sound/)[0]).toHaveStyle({
      fontSize: '24px',
    });
    expect(window.localStorage.getItem('set-player:text-size')).toBe('1');
    for (let i = 0; i < 4; i++) {
      const larger = screen.getByRole('button', { name: 'Larger text' });
      if (!larger.hasAttribute('disabled')) await user.click(larger);
    }
    expect(screen.getByRole('button', { name: 'Larger text' })).toBeDisabled();
  });
});

describe('vocalist', () => {
  it('sees lyrics only: no chords, charts or first chords', () => {
    setup();
    expect(screen.getAllByText(/Amazing grace, how sweet the sound/)[0]).toBeVisible();
    expect(screen.queryByText('First chords')).toBeNull();
    expect(screen.queryByText('Which chart?')).toBeNull();
    expect(document.querySelector('[data-chords]')).toBeNull();
  });

  it('says so when a song has no details', () => {
    setup({ index: 4 });
    expect(screen.getByText('Lyrics aren’t available for this song.')).toBeVisible();
  });
});

describe('musician', () => {
  it('asks which chart every time the song comes up', async () => {
    const { user, getPdfUrl, onOpenResource } = setup({ role: 'musician' });
    expect(screen.getByText('First chords')).toBeInTheDocument();
    const choice = screen.getByRole('heading', { name: 'Which chart?' });
    expect(choice).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Typed chords (in G)' }));
    expect(document.querySelector('[data-chords]')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Choose another chart' }));
    await user.click(screen.getByRole('button', { name: 'Chord chart' }));
    expect(await screen.findByTestId('pdf-pages')).toBeInTheDocument();
    expect(getPdfUrl).toHaveBeenCalledWith(expect.objectContaining({ kind: 'chord_chart' }));
    await user.click(screen.getByRole('button', { name: 'Zoom' }));
    expect(onOpenResource).toHaveBeenCalledWith(expect.objectContaining({ kind: 'chord_chart' }));

    await user.click(screen.getByRole('button', { name: /^Next/ }));
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(screen.getByRole('heading', { name: 'Which chart?' })).toBeVisible();
  });

  it('shows a single chart straight away', async () => {
    setup({ role: 'musician', index: 3 });
    expect(screen.queryByText('Which chart?')).toBeNull();
    expect(await screen.findByTestId('pdf-pages')).toBeInTheDocument();
  });

  it('without a chart, shows the lyrics with first chords', () => {
    setup({ role: 'musician', index: 1 });
    expect(screen.getByText('No chord chart for this song.')).toBeVisible();
    expect(screen.getByText('First chords')).toBeInTheDocument();
    expect(screen.getAllByText(/placeholder/).length).toBeGreaterThan(0);
  });

  it('marks a key with no files; a song without details still gets its PDF chart', async () => {
    setup({ role: 'musician', index: 2 });
    expect(screen.getByText('No files for this key.')).toBeVisible();
    expect(screen.getByText('No chord chart for this song.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    expect(songTitle()).toBe('Song 5 of 6');
    expect(screen.queryByText('Typed chords')).toBeNull();
    expect(await screen.findByTestId('pdf-pages')).toBeInTheDocument();
  });

  it('warns when the typed chords are in another key than the setlist', () => {
    setup({ role: 'musician', index: 5 });
    expect(screen.getByRole('note')).toHaveTextContent(
      'These chords are written in G; this setlist plays the song in A.',
    );
  });

  it('a page-turner press scrolls a screen, then moves on at the end', () => {
    setup({ role: 'musician', index: 1 });
    const el = scroller();
    sized(el, { top: 0 });
    fireEvent.keyDown(el, { key: 'PageDown', timeStamp: 1000 });
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 340, behavior: 'smooth' });
    // A quick second press continues from where the first was heading.
    fireEvent.keyDown(el, { key: 'PageDown', timeStamp: 1100 });
    expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 600, behavior: 'smooth' });
    expect(songTitle()).toBe('Song 2 of 6');
    sized(el, { top: 600 });
    fireEvent.keyDown(el, { key: 'PageDown', timeStamp: 5000 });
    expect(songTitle()).toBe('Song 3 of 6');
    sized(scroller(), { top: 0 });
    fireEvent.keyDown(scroller(), { key: 'PageUp', timeStamp: 9000 });
    expect(songTitle()).toBe('Song 2 of 6');
  });

  it('offers to retry a chart that failed to load', async () => {
    const getPdfUrl = vi.fn(async () => {
      throw new Error('offline');
    });
    const { user } = setup({ role: 'musician', index: 3, getPdfUrl });
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load Chord chart.');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => {});
    expect(getPdfUrl).toHaveBeenCalledTimes(2);
  });
});

describe('projectionist', () => {
  it('shows the running order with the current song, sections and projection files', async () => {
    const { user, onOpenResource } = setup({ role: 'projectionist', index: 4 });
    expect(screen.queryByRole('button', { name: 'Autoscroll' })).toBeNull();
    const order = screen.getByRole('list', { name: 'Running order' });
    const rows = within(order).getAllByRole('listitem');
    expect(rows).toHaveLength(6);
    expect(rows[4]).toHaveAttribute('aria-current', 'step');
    expect(rows[0]).toHaveTextContent('V1 · V2 · C · V3 · C · V4 · V5 · B');
    expect(rows[0]).toHaveTextContent('Amazing grace, how sweet the sound');
    expect(rows[4]).toHaveTextContent('Lyrics aren’t available for this song.');
    await user.click(within(rows[4]!).getByRole('button', { name: 'Slides' }));
    expect(onOpenResource).toHaveBeenCalledWith(expect.objectContaining({ kind: 'projection' }));
    expect(rows[1]).toHaveTextContent('No projection files.');

    await user.click(screen.getByRole('button', { name: /^Next/ }));
    expect(within(order).getAllByRole('listitem')[5]).toHaveAttribute('aria-current', 'step');
  });
});
