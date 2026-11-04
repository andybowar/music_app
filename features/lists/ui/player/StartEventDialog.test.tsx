import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StartEventDialog } from './StartEventDialog';

afterEach(cleanup);

describe('StartEventDialog', () => {
  it('offers the three roles with no default and reports the pick', async () => {
    const onStart = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<StartEventDialog open onOpenChange={onOpenChange} onStart={onStart} />);
    expect(screen.getByRole('dialog', { name: 'Start event' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Musician.*Chord charts/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Vocalist.*Lyrics only/ })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /^Projectionist/ }));
    expect(onStart).toHaveBeenCalledWith('projectionist');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders nothing while closed', () => {
    render(<StartEventDialog open={false} onOpenChange={vi.fn()} onStart={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
