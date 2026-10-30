import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { POP_TOKEN } from '@/components/ui/tokens';
import { thousandHallelujahs } from '@/fixtures';
import { ComposerPanel, ComposerPanelSkeleton } from './ComposerPanel';

afterEach(cleanup);

describe('ComposerPanel', () => {
  it('lists the fixture composer', () => {
    render(<ComposerPanel composers={thousandHallelujahs.composers} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Brooke Ligertwood')).not.toHaveAttribute('data-pop');
  });

  it('lists every composer in order, with POP membership in color and text', () => {
    render(
      <ComposerPanel
        composers={[
          { id: '1', name: 'Ann Current', popMember: 'current' },
          { id: '2', name: 'Bob Past', popMember: 'past' },
          { id: '3', name: 'Cy None', popMember: 'none' },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.firstChild?.textContent)).toEqual([
      'Ann Current',
      'Bob Past',
      'Cy None',
    ]);
    const current = screen.getByText('Ann Current');
    expect(current).toHaveAttribute('title', POP_TOKEN.current.title);
    expect(current).toHaveClass(POP_TOKEN.current.textOnLight);
    expect(screen.getByText(POP_TOKEN.current.title)).toBeInTheDocument();
    expect(screen.getByText('Bob Past')).toHaveClass(POP_TOKEN.past.textOnLight);
    expect(screen.getByText(POP_TOKEN.past.title)).toBeInTheDocument();
  });

  it('shows an empty state', () => {
    render(<ComposerPanel composers={[]} />);
    expect(screen.getByText('No composer recorded for this song.')).toBeInTheDocument();
  });

  it('has a loading skeleton', () => {
    render(<ComposerPanelSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading composers' })).toBeInTheDocument();
  });
});
