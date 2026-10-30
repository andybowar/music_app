import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getItemsForList,
  getSong,
  LIST_IDS,
  SONG_IDS,
  songSummaries,
  thousandHallelujahs,
} from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import type { ResolvedItem, SongSummary } from '@/types/domain';
import { SongRow, resourcesLabel, songRowValues, type SongRowProps } from './SongRow';

afterEach(cleanup);

const song = songSummaries.find((s) => s.id === SONG_IDS.thousandHallelujahs) as SongSummary;

function handlers() {
  return {
    onKey: vi.fn(),
    onTitle: vi.fn(),
    onComposer: vi.fn(),
    onResources: vi.fn(),
    onUsage: vi.fn(),
  } satisfies Pick<SongRowProps, 'onKey' | 'onTitle' | 'onComposer' | 'onResources' | 'onUsage'>;
}

/** A resolved setlist item for `songId` from the BG 4/19/26 fixture list. */
function resolvedFor(songId: string): ResolvedItem {
  const item = getItemsForList(LIST_IDS.bg41926).find((i) => i.songId === songId);
  if (!item) throw new Error(`no item for ${songId}`);
  return resolveItemDisplay(getSong(songId), item);
}

describe('SongRow', () => {
  it('shows every REQ-ROW-01 field', () => {
    render(<SongRow song={song} {...handlers()} />);
    const row = screen.getByRole('group', { name: song.title });
    expect(row).toHaveAttribute('data-song-id', song.id);
    expect(
      within(row).getByRole('img', { name: new RegExp(`^${song.tempoBpm} BPM`) }),
    ).toBeVisible();
    expect(within(row).getByRole('img', { name: /time$/ })).toBeInTheDocument();
    expect(within(row).getByText(song.title)).toBeInTheDocument();
    expect(within(row).getByText(String(song.year))).toBeInTheDocument();
    expect(within(row).getByText(song.composers[0]!.name)).toBeInTheDocument();
    expect(within(row).getByText(String(song.resourceCount))).toBeInTheDocument();
    expect(
      within(row).getByRole('img', { name: `Added by branch ${song.addedByBranchCode}` }),
    ).toBeInTheDocument();
  });

  it('fires each region callback and tabs left→right', async () => {
    const user = userEvent.setup();
    const h = handlers();
    render(
      <SongRow
        song={song}
        {...h}
        dragHandle={<button type="button">Drag</button>}
        addSlot={<button type="button">Add</button>}
      />,
    );
    const order: Array<[RegExp, keyof typeof h | null]> = [
      [/^Drag$/, null],
      [/show all keys$/, 'onKey'],
      [/show first lines$/, 'onTitle'],
      [/show all composers$/, 'onComposer'],
      [/show resources$/, 'onResources'],
      [/show branch usage$/, 'onUsage'],
      [/^Add$/, null],
    ];
    for (const [name, cb] of order) {
      await user.tab();
      const button = screen.getByRole('button', { name });
      expect(button).toHaveFocus();
      if (cb) {
        await user.keyboard('{Enter}');
        expect(h[cb]).toHaveBeenCalledTimes(1);
      }
    }
    for (const fn of Object.values(h)) expect(fn).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /show first lines$/ }));
    expect(h.onTitle).toHaveBeenCalledTimes(2);
  });

  it('names regions by their content', () => {
    render(<SongRow song={song} {...handlers()} />);
    expect(screen.getByRole('button', { name: /show all keys$/ })).toHaveAccessibleName(
      `Key ${song.primaryKey}, show all keys`,
    );
    expect(screen.getByRole('button', { name: /show first lines$/ })).toHaveAccessibleName(
      `${song.title}, show first lines`,
    );
  });

  it('places dragHandle first and addSlot last, and omits them when absent', () => {
    const { container, rerender } = render(
      <SongRow song={song} {...handlers()} dragHandle={<i>h</i>} addSlot={<i>a</i>} />,
    );
    const row = screen.getByRole('group');
    expect(row.firstElementChild).toHaveAttribute('data-slot', 'drag-handle');
    expect(row.lastElementChild).toHaveAttribute('data-slot', 'add');
    rerender(<SongRow song={song} {...handlers()} />);
    expect(container.querySelector('[data-slot]')).toBeNull();
  });

  it('hides the time signature below 480px', () => {
    render(<SongRow song={song} {...handlers()} />);
    expect(screen.getByRole('img', { name: /time$/ }).parentElement).toHaveClass(
      'hidden',
      '@min-[480px]:flex',
    );
  });

  it('uses resolved values and marks overrides', () => {
    const songId = SONG_IDS.beTheCenter; // overrideKey "C"
    const resolved = resolvedFor(songId);
    const summary = resolved.song;
    render(<SongRow song={summary} resolved={resolved} {...handlers()} />);
    const key = screen.getByRole('img', { name: /^Key C, set for this event$/ });
    expect(key).toHaveAttribute('data-overridden', 'true');
    expect(screen.getByRole('img', { name: /BPM|Tempo/ })).not.toHaveAttribute('data-overridden');
    expect(screen.getByRole('button', { name: /show resources$/ })).toHaveAccessibleName(
      `Resources, ${resourcesLabel(resolved.resources.length, resolved.needsUpload)}, show resources`,
    );
  });

  it('marks overridden BPM/energy on the chip', () => {
    const resolved = resolvedFor(SONG_IDS.causeToCelebrate); // overrideBpm 126
    render(<SongRow song={resolved.song} resolved={resolved} {...handlers()} />);
    const chip = screen.getByRole('img', { name: /^126 BPM.*set for this event$/ });
    expect(chip).toHaveAttribute('data-overridden', 'true');
  });

  it('flags a resolved key that needs an upload', () => {
    const resolved: ResolvedItem = {
      ...resolvedFor(SONG_IDS.beTheCenter),
      resources: [],
      needsUpload: true,
    };
    render(<SongRow song={resolved.song} resolved={resolved} {...handlers()} />);
    const button = screen.getByRole('button', { name: /show resources$/ });
    expect(button).toHaveAttribute('data-needs-upload', 'true');
    expect(button).toHaveAccessibleName(
      'Resources, 0 files, upload needed for this key, show resources',
    );
  });

  it('renders null fields without crashing', () => {
    const sparse: SongSummary = {
      ...song,
      year: null,
      tempoBpm: null,
      timeSignature: null,
      energyLevel: null,
      primaryKey: null,
      composers: [],
      addedByBranchCode: null,
      resourceCount: 0,
    };
    render(<SongRow song={sparse} {...handlers()} />);
    expect(screen.getByRole('img', { name: 'Tempo not set, energy not set' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show all keys$/ })).toHaveAccessibleName(
      'Key not set, show all keys',
    );
    expect(screen.getByRole('button', { name: /show branch usage$/ })).toHaveAccessibleName(
      'Added by: branch unknown, show branch usage',
    );
    expect(screen.queryByText(String(song.year))).toBeNull();
  });
});

describe('songRowValues / resourcesLabel', () => {
  it('falls back to the song when not resolved', () => {
    const v = songRowValues(song);
    expect(v).toMatchObject({
      key: song.primaryKey,
      bpm: song.tempoBpm,
      energy: song.energyLevel,
      resourceCount: thousandHallelujahs.resources.length,
      needsUpload: false,
    });
  });

  it('pluralizes', () => {
    expect(resourcesLabel(1, false)).toBe('1 file');
    expect(resourcesLabel(3, false)).toBe('3 files');
  });
});
