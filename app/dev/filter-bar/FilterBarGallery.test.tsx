import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { mockViewport } from '@/components/ui/test-media';

import { FilterBarGallery, fixtureFacets } from './FilterBarGallery';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dev/filter-bar',
  useSearchParams: () => new URLSearchParams('energy=high_praise'),
}));

afterEach(cleanup);

describe('FilterBarGallery', () => {
  it('derives facets from fixtures', () => {
    expect(fixtureFacets.keys.length).toBeGreaterThan(0);
    expect(fixtureFacets.decades.every((d) => d % 10 === 0)).toBe(true);
    expect(fixtureFacets.branches.length).toBeGreaterThan(0);
    expect(fixtureFacets.chords.chorus.length).toBeGreaterThan(0);
  });

  it('renders every demo state', () => {
    mockViewport(1024);
    render(<FilterBarGallery />);
    expect(screen.getAllByRole('toolbar', { name: 'Filters' })).toHaveLength(5);
    expect(screen.getByLabelText('Loading filters')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getAllByRole('list', { name: 'Active filters' })).toHaveLength(5);
  });
});
