import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TimeSigBadge, timeSigLabel } from './TimeSigBadge';

afterEach(cleanup);

describe('TimeSigBadge', () => {
  it('stacks n/d signatures', () => {
    render(<TimeSigBadge value="6/8" />);
    const badge = screen.getByRole('img', { name: '6/8 time' });
    const [top, bottom] = Array.from(badge.children);
    expect(top).toHaveTextContent('6');
    expect(bottom).toHaveTextContent('8');
  });

  it('shows other values inline', () => {
    render(<TimeSigBadge value="C" />);
    const badge = screen.getByRole('img', { name: 'C time' });
    expect(badge).toHaveTextContent('C');
    expect(badge.children).toHaveLength(0);
  });

  it('renders a dash when not set', () => {
    render(<TimeSigBadge value={null} />);
    expect(screen.getByRole('img', { name: 'Time signature not set' })).toHaveTextContent('—');
    expect(timeSigLabel(null)).toBe('Time signature not set');
  });
});
