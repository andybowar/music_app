import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ENERGY_TOKEN } from '@/components/ui/tokens';
import { ENERGY_LEVELS, ENERGY_META } from '@/types/domain';
import { EnergyChip, energyChipLabel, OVERRIDDEN_HINT } from './EnergyChip';

afterEach(cleanup);

describe('energyChipLabel', () => {
  it.each(ENERGY_LEVELS)('uses `${bpm} BPM, ${ENERGY_META.label}` for %s', (energy) => {
    expect(energyChipLabel({ energy, bpm: 68 })).toBe(`68 BPM, ${ENERGY_META[energy].label}`);
  });

  it('falls back for null bpm and/or energy', () => {
    expect(energyChipLabel({ energy: null, bpm: 72 })).toBe('72 BPM, energy not set');
    expect(energyChipLabel({ energy: 'high_praise', bpm: null })).toBe(
      "Tempo not set, High Energy 'Praise'",
    );
    expect(energyChipLabel({ energy: null, bpm: null })).toBe('Tempo not set, energy not set');
  });

  it('appends the override hint', () => {
    expect(energyChipLabel({ energy: 'mid_worship', bpm: 70, overridden: true })).toBe(
      `70 BPM, Mid Energy 'Worship', ${OVERRIDDEN_HINT}`,
    );
  });
});

describe('EnergyChip', () => {
  it.each(ENERGY_LEVELS)('renders BPM on the %s color with label and tooltip', (energy) => {
    render(<EnergyChip energy={energy} bpm={128} />);
    const chip = screen.getByRole('img', { name: `128 BPM, ${ENERGY_META[energy].label}` });
    expect(chip).toHaveTextContent('128');
    expect(chip).toHaveAttribute('title', `128 BPM, ${ENERGY_META[energy].label}`);
    expect(chip).toHaveClass(ENERGY_TOKEN[energy].bg, ENERGY_TOKEN[energy].fg);
    expect(chip).not.toHaveAttribute('data-overridden');
  });

  it('renders a neutral dash chip when nothing is set', () => {
    render(<EnergyChip energy={null} bpm={null} />);
    const chip = screen.getByRole('img', { name: 'Tempo not set, energy not set' });
    expect(chip).toHaveTextContent('—');
    expect(chip).toHaveAttribute('data-energy', 'none');
  });

  it('marks an overridden value with a dotted underline and tooltip', () => {
    render(<EnergyChip energy="deep_worship" bpm={60} overridden />);
    const chip = screen.getByRole('img', { name: /set for this event/ });
    expect(chip).toHaveClass('decoration-dotted');
    expect(chip).toHaveAttribute('data-overridden', 'true');
    expect(chip.title).toMatch(/set for this event$/);
  });

  it('is not focusable on its own (SongRow owns the button)', () => {
    render(<EnergyChip energy="high_worship" bpm={73} />);
    expect(screen.getByRole('img')).not.toHaveAttribute('tabindex');
  });
});
