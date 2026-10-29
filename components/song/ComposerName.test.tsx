import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { POP_TOKEN } from '@/components/ui/tokens';
import { ComposerName, type ComposerNameItem } from './ComposerName';

afterEach(cleanup);

const three: ComposerNameItem[] = [
  { name: 'Chris Tomlin', popMember: 'none' },
  { name: 'Louie Giglio', popMember: 'none' },
  { name: 'Ana Ruiz', popMember: 'current' },
];

describe('ComposerName', () => {
  it('renders a plain name without highlight', () => {
    const { container } = render(
      <ComposerName composers={[{ name: 'Matt Redman', popMember: 'none' }]} />,
    );
    expect(container).toHaveTextContent('Matt Redman');
    expect(container.querySelector('[data-pop]')).toBeNull();
  });

  it.each(['current', 'past'] as const)('highlights POP %s members with color and text', (pop) => {
    render(<ComposerName composers={[{ name: 'Martha Kowal', popMember: pop }]} />);
    const el = screen.getByTitle(POP_TOKEN[pop].title);
    expect(el).toHaveClass(POP_TOKEN[pop].text);
    expect(el).toHaveAttribute('data-pop', pop);
    expect(el).toHaveTextContent(`Martha Kowal (${POP_TOKEN[pop].title})`);
  });

  it('collapses past max into +N with the rest in tooltip and screen-reader text', () => {
    const { container } = render(<ComposerName composers={three} />);
    expect(container).toHaveTextContent('Chris Tomlin, Louie Giglio');
    const more = container.querySelector('[data-overflow]');
    expect(more).toHaveAttribute('title', 'Ana Ruiz (People of Praise member (current))');
    expect(more).toHaveTextContent('+1');
    expect(more).toHaveTextContent('and 1 more: Ana Ruiz');
  });

  it('respects a custom max and clamps it to at least 1', () => {
    const { container, rerender } = render(<ComposerName composers={three} max={3} />);
    expect(container.querySelector('[data-overflow]')).toBeNull();
    rerender(<ComposerName composers={three} max={0} />);
    expect(container.querySelector('[data-overflow]')).toHaveAttribute('data-overflow', '2');
    rerender(<ComposerName composers={three} max={Infinity} />);
    expect(container.querySelector('[data-overflow]')).toBeNull();
  });

  it('renders an unknown state when empty', () => {
    render(<ComposerName composers={[]} />);
    expect(screen.getByText('Composer unknown')).toBeInTheDocument();
    expect(screen.getByTitle('Composer unknown')).toHaveTextContent('—');
  });
});
