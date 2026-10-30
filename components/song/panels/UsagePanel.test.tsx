import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { thousandHallelujahs } from '@/fixtures';
import type { BranchUsage } from '@/types/domain';
import { USAGE_LEVEL_DISPLAY, UsagePanel, UsagePanelSkeleton } from './UsagePanel';

afterEach(cleanup);

describe('UsagePanel', () => {
  it('shows the adding branch and each branch’s level for the fixture song', () => {
    render(
      <UsagePanel
        addedByBranchCode={thousandHallelujahs.addedByBranchCode}
        usage={thousandHallelujahs.usage}
      />,
    );
    expect(screen.getByText('Added by', { exact: false }).parentElement).toHaveTextContent(
      'Added by OR',
    );
    const rows = screen.getAllByRole('row').slice(1); // skip the header row
    expect(rows.map((r) => r.textContent)).toEqual(['SVHigh', 'ORLow', 'COLow', 'RFRare']);
    expect(screen.getByRole('rowheader', { name: 'SV' })).toBeInTheDocument();
  });

  it('marks derived values and labels "none"', () => {
    const usage: BranchUsage[] = [
      { branchId: 'a', branchCode: 'SV', level: 'high', source: 'derived' },
      { branchId: 'b', branchCode: 'OR', level: 'none', source: 'manual' },
    ];
    render(<UsagePanel addedByBranchCode={null} usage={usage} />);
    expect(screen.getByText('unknown branch')).toBeInTheDocument();
    expect(screen.getByText('(from setlists)')).toHaveAttribute(
      'title',
      'Worked out from setlist history',
    );
    expect(screen.getByText('Not used')).toBeInTheDocument();
  });

  it('maps every level to a label and bar count', () => {
    expect(Object.values(USAGE_LEVEL_DISPLAY).map((m) => m.bars)).toEqual([3, 2, 1, 0]);
  });

  it('shows an empty state', () => {
    render(<UsagePanel addedByBranchCode="OR" usage={[]} />);
    expect(screen.getByText('No branch usage recorded yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('has a loading skeleton', () => {
    render(<UsagePanelSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading branch usage' })).toBeInTheDocument();
  });
});
