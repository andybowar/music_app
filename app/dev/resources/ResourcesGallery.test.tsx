import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourcesGallery } from './ResourcesGallery';

// jsdom has no object URLs; the gallery generates sample media with them.
const { createObjectURL, revokeObjectURL } = URL;
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:sample');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});

describe('ResourcesGallery', () => {
  it('renders every state', () => {
    render(<ResourcesGallery />);
    expect(screen.getAllByText('No files yet').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Add files' }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Loading files')).toBeInTheDocument();
    expect(screen.getByLabelText('Loading lyrics')).toBeInTheDocument();
    expect(screen.getByText('No lyrics yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /file unavailable/ })).toBeDisabled();
  });

  it('hides the add-files slot for non-contributors and reports opened files', async () => {
    render(<ResourcesGallery />);
    await userEvent.click(screen.getByRole('checkbox', { name: /contributor/ }));
    expect(screen.queryByRole('link', { name: 'Add files' })).not.toBeInTheDocument();
    await userEvent.click(
      screen.getAllByRole('button', { name: /^MP3 D 1, Audio, plays here/ })[0]!,
    );
    expect(screen.getByTestId('last-action')).toHaveTextContent('play: MP3 D 1 (mp3)');
    expect(screen.getByRole('heading', { name: 'Playing' })).toBeInTheDocument();
  });
});
