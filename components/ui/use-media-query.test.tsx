import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { mockViewport } from './test-media';
import { DESKTOP_QUERY, useMediaQuery } from './use-media-query';

function Probe({ fallback }: { fallback?: boolean }) {
  const desktop = useMediaQuery(DESKTOP_QUERY, fallback);
  return <span data-testid="probe">{desktop ? 'desktop' : 'mobile'}</span>;
}

const original = window.matchMedia;
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: original,
  });
});

describe('useMediaQuery', () => {
  it('reports the current match', () => {
    mockViewport(1024);
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('desktop');
  });

  it('switches at exactly 768px', () => {
    const vp = mockViewport(767);
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('mobile');
    act(() => vp.setWidth(768));
    expect(screen.getByTestId('probe').textContent).toBe('desktop');
    act(() => vp.setWidth(500));
    expect(screen.getByTestId('probe').textContent).toBe('mobile');
  });

  it('uses the server default during SSR', () => {
    mockViewport(1024);
    expect(renderToString(<Probe />)).toContain('mobile');
    expect(renderToString(<Probe fallback />)).toContain('desktop');
  });

  it('falls back to the default when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    render(<Probe fallback />);
    expect(screen.getByTestId('probe').textContent).toBe('desktop');
  });
});
