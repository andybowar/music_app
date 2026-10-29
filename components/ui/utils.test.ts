import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('joins truthy class values and drops falsy ones', () => {
    expect(cn('a', false, null, undefined, 0, 'b', { c: true, d: false }, ['e'])).toBe('a b c e');
  });

  it('lets later Tailwind utilities override earlier conflicting ones', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
    expect(cn('text-sm text-foreground', 'text-energy-high_praise-foreground')).toBe(
      'text-sm text-energy-high_praise-foreground',
    );
  });

  it('knows the UI-01 radius and spacing tokens', () => {
    expect(cn('rounded-md', 'rounded-chip')).toBe('rounded-chip');
    expect(cn('min-h-8', 'min-h-tap')).toBe('min-h-tap');
  });
});
