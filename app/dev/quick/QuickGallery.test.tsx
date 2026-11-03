import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QUICK_STATES, QuickGallery, type QuickState } from './QuickGallery';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

const EXPECT: Record<QuickState, RegExp> = {
  'no-text': /Type a theme from the word/,
  top: /Top 12 of 37 matches/,
  full: /All 37 matches/,
  'over-100': /See all 140 in the library/,
  few: /All 3 matches/,
  'did-you-mean': /Did you mean/,
  'no-matches': /Try a shorter or different word/,
  failed: /Couldn.t search right now/,
};

describe('QuickGallery', () => {
  it.each(Object.keys(QUICK_STATES) as QuickState[])('renders the %s state', async (state) => {
    const user = userEvent.setup();
    render(<QuickGallery />);
    await user.selectOptions(screen.getByLabelText('State'), state);
    expect(screen.getAllByText(EXPECT[state]).length).toBeGreaterThan(0);
  });
});
