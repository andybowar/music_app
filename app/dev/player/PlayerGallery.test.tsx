import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlayerGallery } from './PlayerGallery';

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const liveStatus = () => screen.getByTestId('live-status').textContent;

describe('PlayerGallery', () => {
  it('renders a bar per snapshot plus the live bar', () => {
    render(<PlayerGallery />);
    // 8 snapshots + tab-bar demo + live bar
    expect(screen.getAllByRole('region', { name: 'Player' })).toHaveLength(10);
  });

  it('drives the live bar through the real reducer and fake adapter', () => {
    render(<PlayerGallery />);
    fireEvent.click(screen.getByRole('button', { name: 'Load fixture playlist' }));
    expect(liveStatus()).toBe('loading');
    act(() => vi.advanceTimersByTime(1000));
    expect(liveStatus()).toBe('playing');
    fireEvent.click(screen.getByRole('button', { name: 'Track ends' }));
    expect(liveStatus()).toBe('loading');
    fireEvent.click(screen.getByRole('button', { name: 'Fail next load' }));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('list', { name: 'Event log' })).toHaveTextContent('TRACK_ERROR');
    fireEvent.click(screen.getByRole('button', { name: 'Clear queue' }));
    expect(liveStatus()).toBe('idle');
  });
});
