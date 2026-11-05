import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { getSong, SONG_IDS, thousandHallelujahs } from '@/fixtures';
import { songChordSets } from '@/lib/lyrics/chords';
import type { SongLyrics } from '@/types/domain';
import {
  LyricsViewer,
  LyricsViewerSkeleton,
  SHOW_CHORDS_STORAGE_KEY,
  arrangementBlocks,
  sectionBlocks,
  unsungSections,
} from './LyricsViewer';

afterEach(cleanup);

const { lyrics, arrangement } = thousandHallelujahs;

const blank: SongLyrics = {
  chorus: null,
  verse_1: null,
  verse_2: null,
  verse_3: null,
  verse_4: null,
  verse_5: null,
  bridge: null,
};

const headings = () =>
  screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent?.replace(', ', ' '));

describe('block helpers', () => {
  it('follows the arrangement and counts repeats', () => {
    const blocks = arrangementBlocks(lyrics, arrangement);
    expect(blocks.map((b) => [b.section, b.occurrence])).toEqual([
      ['verse_1', 1],
      ['chorus', 1],
      ['verse_2', 1],
      ['chorus', 2],
      ['bridge', 1],
      ['chorus', 3],
    ]);
    expect(blocks[3]!.text).toBe(lyrics.chorus);
  });

  it('keeps arranged sections without lyrics as empty blocks', () => {
    const blocks = arrangementBlocks({ ...blank, chorus: 'x', verse_1: '  ' }, [
      'verse_1',
      'chorus',
    ]);
    expect(blocks.map((b) => b.text)).toEqual([null, 'x']);
  });

  it('lists sections with lyrics in fixed order', () => {
    expect(sectionBlocks(lyrics).map((b) => b.section)).toEqual([
      'chorus',
      'verse_1',
      'verse_2',
      'bridge',
    ]);
  });

  it('finds sections with lyrics that are not sung', () => {
    expect(unsungSections(lyrics, ['chorus'])).toEqual(['verse_1', 'verse_2', 'bridge']);
    expect(unsungSections(lyrics, arrangement)).toEqual([]);
  });
});

describe('LyricsViewer', () => {
  it('renders in arrangement order with repeats labelled', () => {
    render(<LyricsViewer lyrics={lyrics} arrangement={arrangement} />);
    expect(headings()).toEqual([
      'Verse 1',
      'Chorus',
      'Verse 2',
      'Chorus repeat',
      'Bridge',
      'Chorus repeat',
    ]);
    expect(screen.getAllByText(/thousand hallelujahs/)).toHaveLength(3);
  });

  it('renders by section when asked', () => {
    render(<LyricsViewer lyrics={lyrics} arrangement={arrangement} mode="sections" />);
    expect(headings()).toEqual(['Chorus', 'Verse 1', 'Verse 2', 'Bridge']);
  });

  it('switches view with the toggle, by keyboard', async () => {
    render(<LyricsViewer lyrics={lyrics} arrangement={arrangement} />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'As sung' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'By section' })).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(headings()).toEqual(['Chorus', 'Verse 1', 'Verse 2', 'Bridge']);
    await userEvent.click(screen.getByRole('radio', { name: 'As sung' }));
    expect(headings()[0]).toBe('Verse 1');
  });

  it('follows a changed mode prop', () => {
    const { rerender } = render(<LyricsViewer lyrics={lyrics} arrangement={arrangement} />);
    rerender(<LyricsViewer lyrics={lyrics} arrangement={arrangement} mode="sections" />);
    expect(headings()[0]).toBe('Chorus');
  });

  it('falls back to sections when there is no arrangement', () => {
    render(<LyricsViewer lyrics={lyrics} arrangement={[]} />);
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByText(/No arrangement yet/)).toBeInTheDocument();
    expect(headings()).toEqual(['Chorus', 'Verse 1', 'Verse 2', 'Bridge']);
  });

  it('marks arranged sections with no lyrics and lists unsung sections', () => {
    render(
      <LyricsViewer
        lyrics={{ ...blank, chorus: 'Placeholder chorus', bridge: 'Placeholder bridge' }}
        arrangement={['verse_1', 'chorus']}
      />,
    );
    expect(screen.getByText('No lyrics for this section')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Not in the arrangement' })).toBeInTheDocument();
    expect(screen.getByText('Placeholder bridge')).toBeInTheDocument();
  });

  it('shows an empty state with no lyrics', () => {
    render(<LyricsViewer lyrics={blank} arrangement={['chorus']} />);
    expect(screen.getByText('No lyrics yet')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});

describe('LyricsViewerSkeleton', () => {
  it('stays silent inside a page skeleton that announces itself', () => {
    const { container } = render(<LyricsViewerSkeleton announce={false} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveAttribute('aria-label');
  });

  it('announces loading', () => {
    render(<LyricsViewerSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading lyrics' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });
});

describe('LyricsViewer chords (LIB-22/23)', () => {
  const chorded = getSong(SONG_IDS.amazingGrace);
  const sets = songChordSets(chorded.keys);
  const g = sets[0]!;
  const a = {
    key: 'A',
    sections: {
      ...g.sections,
      verse_1: '[A]Amazing grace, how sweet the sound\n(verse 1 placeholder)',
    },
  };

  afterEach(() => window.localStorage.clear());

  it('shows chords over the lyrics with a toggle and the key', async () => {
    const user = userEvent.setup();
    render(
      <LyricsViewer lyrics={chorded.lyrics} arrangement={chorded.arrangement} chords={sets} />,
    );
    const toggle = screen.getByRole('button', { name: 'Chords' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Chords in G')).toBeVisible();
    expect(document.querySelectorAll('[data-chords]').length).toBeGreaterThan(0);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(document.querySelector('[data-chords]')).toBeNull();
    expect(window.localStorage.getItem(SHOW_CHORDS_STORAGE_KEY)).toBe('false');
  });

  it('remembers hidden chords', () => {
    window.localStorage.setItem(SHOW_CHORDS_STORAGE_KEY, 'false');
    render(
      <LyricsViewer lyrics={chorded.lyrics} arrangement={chorded.arrangement} chords={sets} />,
    );
    expect(screen.getByRole('button', { name: 'Chords' })).toHaveAttribute('aria-pressed', 'false');
    expect(document.querySelector('[data-chords]')).toBeNull();
  });

  it('switches between keys, starting on the first set', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <LyricsViewer lyrics={chorded.lyrics} arrangement={chorded.arrangement} chords={[g, a]} />,
    );
    const verse1 = () => document.querySelector('[data-section="verse_1"] [data-chords]');
    expect(screen.getByRole('radio', { name: 'Chords in G' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(verse1()).toHaveTextContent(/^G/);
    await user.click(screen.getByRole('radio', { name: 'Chords in A' }));
    expect(verse1()).toHaveTextContent(/^A/);
    // A new first set (e.g. the setlist key) takes over.
    rerender(
      <LyricsViewer lyrics={chorded.lyrics} arrangement={chorded.arrangement} chords={[a, g]} />,
    );
    expect(screen.getByRole('radio', { name: 'Chords in A' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('shows plain lyrics for sections without chords, and no toggle without any chords', () => {
    const { unmount } = render(
      <LyricsViewer
        lyrics={chorded.lyrics}
        arrangement={chorded.arrangement}
        chords={[{ key: 'G', sections: { ...blank, verse_1: g.sections.verse_1 } }]}
      />,
    );
    expect(
      document.querySelectorAll('[data-section="verse_1"] [data-chords]').length,
    ).toBeGreaterThan(0);
    expect(document.querySelector('[data-section="chorus"] [data-chords]')).toBeNull();
    unmount();
    render(
      <LyricsViewer
        lyrics={lyrics}
        arrangement={arrangement}
        chords={[{ key: 'D', sections: { ...lyrics } }]}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Chords' })).toBeNull();
  });
});
