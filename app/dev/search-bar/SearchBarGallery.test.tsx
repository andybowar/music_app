import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SearchBarGallery } from './SearchBarGallery';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dev/search-bar',
  useSearchParams: () => new URLSearchParams('q=grace'),
}));

afterEach(cleanup);

describe('SearchBarGallery', () => {
  it('renders every demo state', () => {
    render(<SearchBarGallery />);
    const inputs = screen.getAllByRole('textbox', { name: 'Search songs' });
    expect(inputs.map((i) => (i as HTMLInputElement).value)).toEqual([
      '',
      'Amazing grace',
      'love',
      'grace',
      'A long query that keeps going past the edge',
    ]);
    expect(screen.getAllByRole('search')).toHaveLength(5);
  });
});
