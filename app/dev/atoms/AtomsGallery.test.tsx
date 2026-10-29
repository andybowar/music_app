import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { POP_TOKEN } from '@/components/ui/tokens';
import { ENERGY_LEVELS, ENERGY_META } from '@/types/domain';
import { AtomsGallery } from './AtomsGallery';

afterEach(cleanup);

describe('AtomsGallery', () => {
  it('renders every energy level, null states and POP past/current', () => {
    render(<AtomsGallery />);
    for (const level of ENERGY_LEVELS) {
      expect(
        screen.getAllByRole('img', { name: new RegExp(ENERGY_META[level].label) }).length,
      ).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole('img', { name: 'Tempo not set, energy not set' }).length).toBe(2);
    expect(screen.getByRole('img', { name: 'Key not set' })).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Time signature not set' }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByRole('img', { name: 'Added by: branch unknown' }).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByTitle(POP_TOKEN.current.title).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle(POP_TOKEN.past.title).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img', { name: /set for this event/ })).toHaveLength(2);
  });
});
