import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mockViewport } from '@/components/ui/test-media';
import { thousandHallelujahs } from '@/fixtures';
import { PanelsGallery } from './PanelsGallery';

beforeAll(() => {
  // Radix positioning/scroll-lock touch APIs jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(cleanup);

describe('PanelsGallery', () => {
  it('renders every panel for the fixture song, plus empty and loading states', () => {
    mockViewport(1024);
    render(<PanelsGallery />);
    expect(screen.getAllByText(thousandHallelujahs.chorusLine!).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Brooke Ligertwood').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('table', { name: 'Usage by branch' }).length).toBeGreaterThan(0);
    expect(screen.getByText('No keys recorded for this song yet.')).toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(4);
  });

  it('opens the key panel from the row', async () => {
    mockViewport(360);
    const user = userEvent.setup();
    render(<PanelsGallery />);
    await user.click(screen.getByRole('button', { name: 'Keys and first chords' }));
    expect(await screen.findByRole('dialog', { name: 'Keys' })).toBeInTheDocument();
  });
});
