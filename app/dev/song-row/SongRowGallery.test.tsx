import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { SongRowGallery } from './SongRowGallery';

afterEach(cleanup);

describe('SongRowGallery', () => {
  it('renders 8 result rows plus the setlist and logs callbacks', async () => {
    render(<SongRowGallery />);
    const results = screen.getByRole('heading', { name: /Search results/ }).parentElement!;
    expect(results.querySelectorAll('[role="group"]')).toHaveLength(8);
    expect(screen.getAllByRole('img', { name: /set for this event/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /^Reorder / }).length).toBeGreaterThan(0);

    await userEvent.click(screen.getAllByRole('button', { name: /show all keys$/ })[0]!);
    expect(screen.getByTestId('handler-log')).toHaveTextContent(/^onKey\(\)/);
  });
});
