/** Keeps the screen awake while the set player is open (LIST-11). */
import { useEffect } from 'react';

interface WakeLockSentinelLike {
  release(): Promise<void>;
}
interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

/**
 * Requests a screen wake lock while `active`, again whenever the page becomes visible (browsers
 * drop the lock when it's hidden), and releases it on exit. Does nothing where the API is
 * missing or refused.
 */
export function useScreenWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let done = false;

    const acquire = async () => {
      try {
        const next = await wakeLock.request('screen');
        if (done) void next.release().catch(() => {});
        else sentinel = next;
      } catch {
        // Refused (battery saver, not allowed): the player still works.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
