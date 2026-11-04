import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useScreenWakeLock } from './wakeLock';

function Harness({ active }: { active: boolean }) {
  useScreenWakeLock(active);
  return null;
}

function mockWakeLock(request: () => Promise<{ release(): Promise<void> }>) {
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
}

afterEach(() => {
  // @ts-expect-error reason: test cleanup of a property jsdom doesn't have.
  delete navigator.wakeLock;
});

const flush = () => act(async () => {});

describe('useScreenWakeLock', () => {
  it('acquires, re-acquires when visible again, and releases on exit', async () => {
    const release = vi.fn(async () => {});
    const request = vi.fn(async () => ({ release }));
    mockWakeLock(request);
    const { unmount } = render(<Harness active />);
    await flush();
    expect(request).toHaveBeenCalledWith('screen');

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);

    unmount();
    expect(release).toHaveBeenCalled();
  });

  it('does nothing when inactive, unsupported or refused', async () => {
    const request = vi.fn(async () => {
      throw new Error('NotAllowedError');
    });
    mockWakeLock(request);
    const error = vi.spyOn(console, 'error');
    render(<Harness active={false} />);
    await flush();
    expect(request).not.toHaveBeenCalled();
    render(<Harness active />);
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();

    // @ts-expect-error reason: simulate a browser without the API.
    delete navigator.wakeLock;
    expect(() => render(<Harness active />)).not.toThrow();
  });

  it('releases a lock that arrives after exit', async () => {
    const release = vi.fn(async () => {});
    let resolve!: (s: { release(): Promise<void> }) => void;
    mockWakeLock(() => new Promise((r) => (resolve = r)));
    const { unmount } = render(<Harness active />);
    unmount();
    resolve({ release });
    await flush();
    expect(release).toHaveBeenCalled();
  });
});
