import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BranchCode } from './BranchCode';

afterEach(cleanup);

describe('BranchCode', () => {
  it('renders the code with an accessible name', () => {
    render(<BranchCode code="OR" />);
    const el = screen.getByRole('img', { name: 'Added by branch OR' });
    expect(el).toHaveTextContent('OR');
    expect(el).toHaveAttribute('title', 'Added by branch OR');
  });

  it('renders a dash when unknown', () => {
    render(<BranchCode code={null} />);
    expect(screen.getByRole('img', { name: 'Added by: branch unknown' })).toHaveTextContent('—');
  });
});
