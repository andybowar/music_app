'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { InstallHint } from '@/features/install/detect';
import { InstallBanner, InstallSteps } from '@/features/install/InstallBanner';

const CASES: Array<{ label: string; hint: InstallHint }> = [
  { label: 'iPad, Safari', hint: { device: 'ipad', browser: 'safari' } },
  { label: 'iPad, Chrome', hint: { device: 'ipad', browser: 'other' } },
  { label: 'iPhone, Safari', hint: { device: 'iphone', browser: 'safari' } },
  { label: 'iPhone, Chrome', hint: { device: 'iphone', browser: 'other' } },
];

/** Body of `/dev/install-banner`: the banner and its steps for each device and browser. */
export function InstallBannerGallery() {
  const [steps, setSteps] = useState<InstallHint | null>(null);
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Install banner</h1>
        <p className="text-sm text-muted-foreground">
          Shown on iPad and iPhone only, never in the installed app; ✕ hides it for 30 days. These
          examples are forced; on this device the real banner shows only if it&apos;s an iPad or
          iPhone.
        </p>
      </header>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">This device (real detection)</h2>
        <div className="min-h-12 rounded-lg border" data-testid="real-banner">
          <InstallBanner />
        </div>
      </section>
      {CASES.map((c) => (
        <section key={c.label} className="space-y-2">
          <h2 className="text-lg font-semibold">{c.label}</h2>
          <div className="rounded-lg border">
            <InstallBanner hint={c.hint} />
          </div>
          <Button variant="outline" className="min-h-tap" onClick={() => setSteps(c.hint)}>
            Open the steps
          </Button>
        </section>
      ))}
      {steps && <InstallSteps hint={steps} open onOpenChange={(o) => !o && setSteps(null)} />}
    </main>
  );
}
