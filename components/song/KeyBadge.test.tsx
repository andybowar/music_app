import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { KeyBadge, displayKey, keyBadgeLabel, spokenKey } from './KeyBadge';

afterEach(cleanup);

describe('key helpers', () => {
  it.each([
    ['D', 'D', 'D'],
    ['Bb', 'B♭', 'B flat'],
    ['F#', 'F♯', 'F sharp'],
    ['F#m', 'F♯m', 'F sharp minor'],
    ['Am', 'Am', 'A minor'],
    ['Ebm', 'E♭m', 'E flat minor'],
  ])('%s → display %s, spoken %s', (value, shown, spoken) => {
    expect(displayKey(value)).toBe(shown);
    expect(spokenKey(value)).toBe(spoken);
  });

  it('passes unknown shapes through', () => {
    expect(spokenKey('D/F#')).toBe('D/F#');
    expect(displayKey('x')).toBe('x');
  });

  it('labels null and overridden keys', () => {
    expect(keyBadgeLabel({ value: null })).toBe('Key not set');
    expect(keyBadgeLabel({ value: 'E', overridden: true })).toBe('Key E, set for this event');
  });
});

describe('KeyBadge', () => {
  it('renders the key with an accessible name', () => {
    render(<KeyBadge value="Bb" />);
    const badge = screen.getByRole('img', { name: 'Key B flat' });
    expect(badge).toHaveTextContent('B♭');
    expect(badge).not.toHaveClass('decoration-dotted');
  });

  it('renders a dash when not set', () => {
    render(<KeyBadge value={null} />);
    expect(screen.getByRole('img', { name: 'Key not set' })).toHaveTextContent('—');
  });

  it('marks an override with dotted underline and tooltip', () => {
    render(<KeyBadge value="G" overridden />);
    const badge = screen.getByRole('img', { name: 'Key G, set for this event' });
    expect(badge).toHaveClass('decoration-dotted');
    expect(badge).toHaveAttribute('title', 'Key G, set for this event');
  });
});
