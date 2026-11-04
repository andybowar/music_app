import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { BugReportList, screenshotCountLabel } from './BugReportList';
import { makeBug } from './testUtils';

afterEach(cleanup);

const reports = [
  makeBug({ id: 'a', title: 'Old', createdAt: '2026-10-01T00:00:00.000Z', imageCount: 1 }),
  makeBug({ id: 'b', title: 'New', status: 'fixed', createdAt: '2026-10-05T00:00:00.000Z' }),
];

describe('BugReportList', () => {
  it('shows a reporter their reports newest first, with status text and image count', () => {
    render(<BugReportList reports={reports} />);
    const items = within(screen.getByRole('list', { name: 'Bug reports' })).getAllByRole('link');
    expect(items.map((a) => a.getAttribute('href'))).toEqual(['/bugs/b', '/bugs/a']);
    expect(items[0]).toHaveTextContent('Fixed');
    expect(items[1]).toHaveTextContent('1 screenshot');
    expect(screen.queryByText('Mia Member')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('shows admins the reporter, admin links and the status filter', () => {
    render(<BugReportList reports={reports} admin status="fixed" />);
    const nav = screen.getByRole('navigation', { name: 'Filter by status' });
    expect(within(nav).getByRole('link', { name: 'Fixed' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: "Won't fix" })).toHaveAttribute(
      'href',
      '/admin/bugs?status=wont_fix',
    );
    const links = within(screen.getByRole('list', { name: 'Bug reports' })).getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/admin/bugs/b');
    expect(links[0]).toHaveTextContent('Mia Member');
  });

  it('limits without a filter (dashboard preview)', () => {
    render(<BugReportList reports={reports} admin limit={1} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('link')).toHaveLength(1);
  });

  it('has empty states', () => {
    const { unmount } = render(<BugReportList reports={[]} />);
    expect(screen.getByText("You haven't reported any bugs.")).toBeInTheDocument();
    unmount();
    render(<BugReportList reports={[]} admin />);
    expect(screen.getByText('No bug reports yet.')).toBeInTheDocument();
    cleanup();
    render(<BugReportList reports={reports} admin status="duplicate" />);
    expect(screen.getByText('No bug reports marked duplicate.')).toBeInTheDocument();
  });

  it('screenshotCountLabel', () => {
    expect(screenshotCountLabel(0)).toBe('0 screenshots');
    expect(screenshotCountLabel(1)).toBe('1 screenshot');
  });
});
