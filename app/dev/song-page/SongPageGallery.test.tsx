import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockViewport } from '@/components/ui/test-media';
import { SongPageGallery } from './SongPageGallery';

// jsdom has no object URLs; the gallery generates sample media with them.
const { createObjectURL, revokeObjectURL } = URL;
beforeEach(() => {
  // The sonner Toaster reads prefers-color-scheme.
  mockViewport(1024);
  URL.createObjectURL = vi.fn(() => 'blob:sample');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

describe('SongPageGallery', () => {
  it('renders a fixture song and switches states and permissions', async () => {
    render(<SongPageGallery />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'A Thousand Hallelujahs' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'History' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: /Can edit/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Can view history/ }));
    expect(screen.queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'History' })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'State' }), 'loading');
    expect(screen.getByText('Loading song…')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'State' }), 'error');
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this song");
  });

  it('plays audio from the fake signer', async () => {
    render(<SongPageGallery />);
    await userEvent.click(screen.getByRole('button', { name: /^MP3 D 1, .*plays here/ }));
    expect(await screen.findByTestId('now-playing')).toBeInTheDocument();
  });
});
