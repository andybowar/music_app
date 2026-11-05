import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DISMISS_STORAGE_KEY } from './detect';
import { InstallBanner, shareButtonPlace } from './InstallBanner';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubIphone() {
  vi.stubGlobal('navigator', {
    ...navigator,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) Version/17.4 Mobile Safari',
    maxTouchPoints: 5,
  });
}

describe('InstallBanner', () => {
  it('walks through the three steps for an iPad', async () => {
    const user = userEvent.setup();
    render(<InstallBanner hint={{ device: 'ipad', browser: 'safari' }} />);
    expect(screen.getByRole('complementary', { name: 'Install the app' })).toHaveTextContent(
      'Add Worship Library to your iPad’s Home Screen',
    );
    await user.click(screen.getByRole('button', { name: 'Show me how' }));
    const dialog = screen.getByRole('dialog', { name: 'Add to your Home Screen' });
    const steps = within(dialog).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent('Tap the Share button');
    expect(steps[0]).toHaveTextContent('at the top right, next to the address bar');
    expect(steps[1]).toHaveTextContent('Add to Home Screen');
    expect(steps[2]).toHaveTextContent('sign in again');
    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('✕ hides it and remembers it on the device', async () => {
    const user = userEvent.setup();
    render(<InstallBanner hint={{ device: 'iphone', browser: 'safari' }} />);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(window.localStorage.getItem(DISMISS_STORAGE_KEY)).toBeTruthy();
  });

  it('stays hidden for good after ✕, including an old timestamp from the 30-day version', async () => {
    stubIphone();
    window.localStorage.setItem(DISMISS_STORAGE_KEY, '2020-01-01T00:00:00.000Z');
    render(<InstallBanner />);
    // Let the detection effect run, then check nothing appeared.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('still dismisses for the session when storage throws', async () => {
    const user = userEvent.setup();
    stubIphone();
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<InstallBanner />);
    expect(await screen.findByText(/your iPhone’s Home Screen/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(setItem).toHaveBeenCalled();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('detects the device itself: nothing on a desktop, the banner on an iPhone', async () => {
    const { unmount } = render(<InstallBanner />);
    expect(screen.queryByRole('complementary')).toBeNull();
    unmount();
    stubIphone();
    render(<InstallBanner />);
    expect(await screen.findByText(/your iPhone’s Home Screen/)).toBeInTheDocument();
  });

  it('puts the Share button in the right place for each browser', () => {
    expect(shareButtonPlace({ device: 'iphone', browser: 'safari' })).toBe(
      'at the bottom of the screen',
    );
    expect(shareButtonPlace({ device: 'ipad', browser: 'other' })).toMatch(/^in the address bar/);
  });
});
