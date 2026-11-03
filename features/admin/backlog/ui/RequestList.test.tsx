import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { RequestList } from './RequestList';
import { makeRequest } from './testUtils';

afterEach(cleanup);

const requests = [
  makeRequest({ id: 'a', title: 'Old', createdAt: '2026-10-01T00:00:00.000Z', imageCount: 1 }),
  makeRequest({
    id: 'b',
    title: 'New',
    createdAt: '2026-11-01T00:00:00.000Z',
    status: 'planned',
    kind: 'change',
  }),
  makeRequest({ id: 'c', title: 'Mid', createdAt: '2026-10-15T00:00:00.000Z', imageCount: 3 }),
];

describe('RequestList', () => {
  it('lists newest first with kind, status, submitter and image count', () => {
    render(<RequestList requests={requests} />);
    const rows = within(screen.getByRole('list', { name: 'Requests' })).getAllByRole('link');
    expect(rows.map((r) => r.getAttribute('href'))).toEqual([
      '/admin/requests/b',
      '/admin/requests/c',
      '/admin/requests/a',
    ]);
    expect(rows[0]).toHaveTextContent('Change');
    expect(rows[0]).toHaveTextContent('Planned');
    expect(rows[0]).toHaveTextContent('Ada Admin');
    expect(rows[1]).toHaveTextContent('3 images');
    expect(rows[2]).toHaveTextContent('1 image');
  });

  it('filters by status and marks the current filter', () => {
    render(<RequestList requests={requests} status="planned" />);
    expect(
      screen
        .getAllByRole('link', { name: /New|Old|Mid/ })
        .filter((l) => l.getAttribute('href')?.startsWith('/admin/requests/')),
    ).toHaveLength(1);
    const nav = screen.getByRole('navigation', { name: 'Filter by status' });
    expect(within(nav).getByRole('link', { name: 'Planned' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'All' })).toHaveAttribute(
      'href',
      '/admin/requests',
    );
    expect(within(nav).getByRole('link', { name: 'In progress' })).toHaveAttribute(
      'href',
      '/admin/requests?status=in_progress',
    );
  });

  it('limits without a filter for the dashboard', () => {
    render(<RequestList requests={requests} limit={2} />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Requests' })).getAllByRole('link'),
    ).toHaveLength(2);
  });

  it('shows empty states', () => {
    render(<RequestList requests={[]} />);
    expect(screen.getByText('No requests yet.')).toBeInTheDocument();
    cleanup();
    render(<RequestList requests={requests} status="declined" />);
    expect(screen.getByText('No declined requests.')).toBeInTheDocument();
  });
});
