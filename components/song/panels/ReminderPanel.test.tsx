import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { thousandHallelujahs } from '@/fixtures';
import { ReminderPanel, ReminderPanelSkeleton } from './ReminderPanel';

afterEach(cleanup);

describe('ReminderPanel', () => {
  it('shows the chorus and verse 1 first lines', () => {
    render(
      <ReminderPanel
        chorusLine={thousandHallelujahs.chorusLine}
        verse1Line={thousandHallelujahs.verse1Line}
      />,
    );
    const terms = screen.getAllByRole('term').map((t) => t.textContent);
    const lines = screen.getAllByRole('definition').map((d) => d.textContent);
    expect(terms).toEqual(['Chorus', 'Verse 1']);
    expect(lines).toEqual([thousandHallelujahs.chorusLine, thousandHallelujahs.verse1Line]);
  });

  it('notes a missing line', () => {
    render(<ReminderPanel chorusLine="  " verse1Line="Line one" />);
    expect(screen.getByText('No chorus')).toBeInTheDocument();
    expect(screen.getByText('Line one')).toBeInTheDocument();
  });

  it('shows an empty state when both are missing', () => {
    render(<ReminderPanel chorusLine={null} verse1Line={null} />);
    expect(screen.getByText('No lyrics recorded for this song yet.')).toBeInTheDocument();
  });

  it('has a loading skeleton', () => {
    render(<ReminderPanelSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading lyrics reminder' })).toBeInTheDocument();
  });
});
