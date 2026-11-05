'use client';

import { ShareIcon, SmartphoneIcon, SquarePlusIcon, TabletIcon, XIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { DISMISS_STORAGE_KEY, installHint, type InstallHint } from './detect';

const APP_NAME = 'Worship Library';

function readDismissed(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeDismissed(at: Date): void {
  try {
    window.localStorage.setItem(DISMISS_STORAGE_KEY, at.toISOString());
  } catch {
    // Not saved: the banner comes back next visit.
  }
}

/** The hint for this browser, worked out after mount (the server can't know the device). */
function useInstallHint(): InstallHint | null {
  const [hint, setHint] = useState<InstallHint | null>(null);
  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean };
    setHint(
      installHint({
        device: { userAgent: nav.userAgent, maxTouchPoints: nav.maxTouchPoints ?? 0 },
        standalone:
          nav.standalone === true ||
          window.matchMedia?.('(display-mode: standalone)').matches === true,
        dismissedAt: readDismissed(),
        now: new Date(),
      }),
    );
  }, []);
  return hint;
}

export interface InstallBannerProps {
  /** Show this hint instead of detecting one (the `/dev` gallery and tests). */
  hint?: InstallHint | null;
}

/**
 * "Add Worship Library to your Home Screen" for iPad and iPhone, which have no install prompt
 * (REQ-NF-02). Shown on signed-in pages, never inside the installed app; ✕ hides it for 30
 * days on the device. "Show me how" walks through the three steps for the browser in use.
 */
export function InstallBanner({ hint: forced }: InstallBannerProps) {
  const detected = useInstallHint();
  const hint = forced === undefined ? detected : forced;
  const [dismissed, setDismissed] = useState(false);
  const [open, setOpen] = useState(false);
  if (!hint || dismissed) return null;

  const deviceName = hint.device === 'ipad' ? 'iPad' : 'iPhone';
  const DeviceIcon = hint.device === 'ipad' ? TabletIcon : SmartphoneIcon;

  return (
    <aside aria-label="Install the app" className="border-b bg-muted/60">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-2 text-sm">
        <DeviceIcon aria-hidden className="size-5 shrink-0" />
        <p className="min-w-0 flex-1">
          Add {APP_NAME} to your {deviceName}’s Home Screen to open it like an app.
        </p>
        <Button variant="outline" size="sm" className="min-h-tap" onClick={() => setOpen(true)}>
          Show me how
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Dismiss for 30 days"
          onClick={() => {
            writeDismissed(new Date());
            setDismissed(true);
          }}
        >
          <XIcon aria-hidden />
        </Button>
      </div>
      <InstallSteps hint={hint} open={open} onOpenChange={setOpen} />
    </aside>
  );
}

/** Where the Share button is, by device and browser. */
export function shareButtonPlace({ device, browser }: InstallHint): string {
  if (browser === 'other') return 'in the address bar (in some browsers it’s in the ⋯ menu)';
  return device === 'ipad'
    ? 'at the top right, next to the address bar'
    : 'at the bottom of the screen';
}

export function InstallSteps({
  hint,
  open,
  onOpenChange,
}: {
  hint: InstallHint;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const deviceName = hint.device === 'ipad' ? 'iPad' : 'iPhone';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to your Home Screen</DialogTitle>
          <DialogDescription>
            {APP_NAME} then opens full screen from its own icon, like an app.
          </DialogDescription>
        </DialogHeader>
        <ol className="flex flex-col gap-4 text-sm">
          <li className="flex gap-3">
            <Step n={1} />
            <p>
              Tap the <strong>Share</strong> button{' '}
              <ShareIcon
                role="img"
                aria-label="(a square with an arrow pointing up)"
                className="inline size-4 align-text-bottom"
              />{' '}
              {shareButtonPlace(hint)}.
            </p>
          </li>
          <li className="flex gap-3">
            <Step n={2} />
            <p>
              Scroll down the list if you need to, and tap <strong>Add to Home Screen</strong>{' '}
              <SquarePlusIcon
                role="img"
                aria-label="(a square with a plus)"
                className="inline size-4 align-text-bottom"
              />
              .
            </p>
          </li>
          <li className="flex gap-3">
            <Step n={3} />
            <p>
              Tap <strong>Add</strong>. Open {APP_NAME} from your Home Screen and{' '}
              <strong>sign in again</strong>: the Home Screen app keeps its own sign-in.
            </p>
          </li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Tip: open the setlists you’ll need once while you’re online, and they’ll work on your{' '}
          {deviceName} without a connection.
        </p>
        <DialogFooter>
          <Button className="min-h-tap" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background"
    >
      {n}
    </span>
  );
}
