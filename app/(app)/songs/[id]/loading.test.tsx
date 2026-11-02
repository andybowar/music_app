import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Loading from './loading';

describe('song segment loading', () => {
  it('renders the song page skeleton with a status message', () => {
    render(<Loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading song');
  });
});
