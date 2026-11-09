import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Worship Library', template: '%s · Worship Library' },
  description: 'The shared song library for People of Praise branches.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // iPhones only report the home-indicator area (env(safe-area-inset-bottom)) to the page with
  // `cover`; without it the bottom tab bar sat on the swipe-up-to-close gesture area.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
