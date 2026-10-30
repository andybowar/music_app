import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResultsGallery, thousandSongs } from './ResultsGallery';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('ResultsGallery', () => {
  it('builds 1,000 unique fixture rows', () => {
    expect(new Set(thousandSongs.map((s) => s.id)).size).toBe(1000);
  });

  it('renders every state', () => {
    render(<ResultsGallery />);
    const statuses = screen.getAllByRole('status').map((s) => s.textContent);
    expect(statuses).toEqual(
      expect.arrayContaining(['8 songs', 'Searching…', '0 songs', 'Search failed', '12 songs']),
    );
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t load songs');
  });

  it('pages the infinite demo with the load-more button', async () => {
    vi.useFakeTimers();
    render(<ResultsGallery />);
    const region = screen
      .getByRole('heading', { name: /1,000 results/ })
      .parentElement!.querySelector('section[aria-label="Search results"]') as HTMLElement;
    const songs = () => within(region).getByRole('list', { name: 'Songs' }).children.length;
    expect(songs()).toBe(50);

    const button = within(region).getByRole('button', { name: /Load more songs/ });
    await act(async () => {
      button.click();
    });
    expect(region).toHaveAttribute('aria-busy', 'true');
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(songs()).toBe(100);
  });

  it('records clear-filter presses', async () => {
    render(<ResultsGallery />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByTestId('cleared')).toHaveTextContent('1 times');
  });
});
