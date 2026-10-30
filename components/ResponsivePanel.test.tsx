import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mockViewport } from '@/components/ui/test-media';
import { ResponsivePanel } from './ResponsivePanel';

const original = window.matchMedia;

beforeAll(() => {
  // Radix positioning/scroll-lock touch APIs jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

afterEach(() => {
  cleanup();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: original,
  });
});

function Panel() {
  return (
    <ResponsivePanel trigger={<button type="button">Key D</button>} title="Keys">
      <button type="button">Inside</button>
    </ResponsivePanel>
  );
}

describe('ResponsivePanel', () => {
  it('renders a popover at >= 768px', async () => {
    mockViewport(768);
    const user = userEvent.setup();
    render(<Panel />);
    await user.click(screen.getByRole('button', { name: 'Key D' }));
    const panel = await screen.findByRole('dialog', { name: 'Keys' });
    expect(panel).toHaveAttribute('data-mode', 'popover');
  });

  it('renders a bottom sheet below 768px', async () => {
    mockViewport(767);
    const user = userEvent.setup();
    render(<Panel />);
    await user.click(screen.getByRole('button', { name: 'Key D' }));
    const panel = await screen.findByRole('dialog', { name: 'Keys' });
    expect(panel).toHaveAttribute('data-mode', 'sheet');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it.each([
    ['popover', 1024],
    ['sheet', 360],
  ])('%s: opens from the keyboard, moves focus in, Escape returns focus', async (_mode, width) => {
    mockViewport(width);
    const user = userEvent.setup();
    render(<Panel />);
    const trigger = screen.getByRole('button', { name: 'Key D' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');

    const panel = await screen.findByRole('dialog', { name: 'Keys' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('stays open and switches mode when the viewport crosses 768px', async () => {
    const vp = mockViewport(1024);
    const user = userEvent.setup();
    render(<Panel />);
    await user.click(screen.getByRole('button', { name: 'Key D' }));
    expect(await screen.findByRole('dialog', { name: 'Keys' })).toHaveAttribute(
      'data-mode',
      'popover',
    );

    act(() => vp.setWidth(400));
    expect(await screen.findByRole('dialog', { name: 'Keys' })).toHaveAttribute(
      'data-mode',
      'sheet',
    );
  });

  it('wraps a non-element trigger in a button', async () => {
    mockViewport(1024);
    const user = userEvent.setup();
    render(
      <ResponsivePanel trigger="Usage" title="Usage by branch">
        <p>Body</p>
      </ResponsivePanel>,
    );
    await user.click(screen.getByRole('button', { name: 'Usage' }));
    expect(await screen.findByRole('dialog', { name: 'Usage by branch' })).toHaveTextContent(
      'Body',
    );
  });

  it.each([
    ['popover', 1024],
    ['sheet', 360],
  ])(
    '%s: controlled without a trigger, opens from a callback and returns focus to the opener',
    async (mode, width) => {
      mockViewport(width);
      const user = userEvent.setup();
      const changes: boolean[] = [];
      function Controlled() {
        const [open, setOpen] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setOpen(true)}>
              Key D
            </button>
            <ResponsivePanel
              open={open}
              onOpenChange={(next) => {
                changes.push(next);
                setOpen(next);
              }}
              anchor={<div>Row</div>}
              title="Keys"
            >
              <button type="button">Inside</button>
            </ResponsivePanel>
          </>
        );
      }
      render(<Controlled />);
      expect(screen.getByText('Row')).toBeInTheDocument();
      const opener = screen.getByRole('button', { name: 'Key D' });

      await user.click(opener);
      const panel = await screen.findByRole('dialog', { name: 'Keys' });
      expect(panel).toHaveAttribute('data-mode', mode);
      await waitFor(() => expect(panel.contains(document.activeElement)).toBe(true));

      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(changes).toEqual([false]);
      expect(opener).toHaveFocus();
    },
  );

  it('controlled with a trigger reports changes and follows the open prop', async () => {
    mockViewport(1024);
    const user = userEvent.setup();
    const changes: boolean[] = [];
    const { rerender } = render(
      <ResponsivePanel
        open={false}
        onOpenChange={(next) => changes.push(next)}
        trigger={<button type="button">Key D</button>}
        title="Keys"
      >
        <p>Body</p>
      </ResponsivePanel>,
    );
    await user.click(screen.getByRole('button', { name: 'Key D' }));
    expect(changes).toEqual([true]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(
      <ResponsivePanel
        open
        onOpenChange={(next) => changes.push(next)}
        trigger={<button type="button">Key D</button>}
        title="Keys"
      >
        <p>Body</p>
      </ResponsivePanel>,
    );
    expect(await screen.findByRole('dialog', { name: 'Keys' })).toHaveTextContent('Body');
  });

  it('server-renders only the trigger, without matchMedia', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const html = renderToString(<Panel />);
    expect(html).toContain('Key D');
    expect(html).not.toContain('Inside');
  });
});
