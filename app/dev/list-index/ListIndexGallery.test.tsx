import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ListIndexGallery, VIEWS } from './ListIndexGallery';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

beforeAll(() => {
  // Radix and sonner touch APIs jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(cleanup);

const EXPECT: Record<keyof typeof VIEWS, RegExp> = {
  'setlist-mine': /AG 4\/25\/26/,
  'setlist-branch': /BG 4\/19\/26/,
  'setlist-all': /CS 5\/3\/26/,
  playlist: /Background 1/,
  loading: /^$/,
  error: /Couldn.t load setlists/,
  'empty-mine': /You have no setlists yet/,
  'empty-branch': /No setlists from you or your branch yet/,
  'empty-all': /No setlists yet/,
  'empty-playlist': /You have no playlists yet/,
};

describe('ListIndexGallery', () => {
  it.each(Object.keys(VIEWS) as Array<keyof typeof VIEWS>)('renders %s', async (view) => {
    const user = userEvent.setup();
    render(<ListIndexGallery />);
    await user.selectOptions(screen.getByLabelText('State'), view);
    if (view === 'loading') {
      expect(screen.getByRole('list', { name: 'Loading setlists' })).toBeInTheDocument();
    } else {
      expect(screen.getAllByText(EXPECT[view]).length).toBeGreaterThan(0);
    }
  });

  it('groups setlists into upcoming, past and no date', () => {
    render(<ListIndexGallery />);
    for (const name of ['Upcoming', 'Past', 'No date']) {
      expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    }
  });
});
