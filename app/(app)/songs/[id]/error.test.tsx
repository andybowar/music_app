import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { default: SongError } = await import('./error');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('song segment error boundary', () => {
  it('shows the song error message as an alert, without the raw error', () => {
    render(<SongError error={new Error('boom')} reset={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this song");
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('refreshes server data and resets the segment on retry', async () => {
    const reset = vi.fn();
    render(<SongError error={new Error('boom')} reset={reset} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(reset).toHaveBeenCalledOnce();
  });
});
