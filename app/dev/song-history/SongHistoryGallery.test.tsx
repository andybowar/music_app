import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SongHistoryGallery } from './SongHistoryGallery';

afterEach(cleanup);

describe('SongHistoryGallery', () => {
  it('renders the fixture trail and switches states', async () => {
    render(<SongHistoryGallery />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading change history…');
    expect(await screen.findByText('Created the song')).toBeInTheDocument();

    const select = screen.getByRole('combobox', { name: 'State' });
    await userEvent.selectOptions(select, 'empty');
    expect(await screen.findByText('No changes recorded yet.')).toBeInTheDocument();

    await userEvent.selectOptions(select, 'error');
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong.');

    await userEvent.selectOptions(select, 'forbidden');
    expect(await screen.findByRole('alert')).toHaveTextContent("You don't have permission");

    await userEvent.selectOptions(select, 'loading');
    expect(screen.getByRole('status')).toHaveTextContent('Loading change history…');
  });
});
