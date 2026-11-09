import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { THEME_BOOT_SCRIPT } from '@/features/theme-trial/themes';
import { ThemeTrial } from '@/features/theme-trial/ThemeTrial';

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
  // Browser and status bar colour: the dark theme's page colour (app/globals.css).
  themeColor: '#121212',
  colorScheme: 'dark',
};

/** TEMPORARY: the five-palette switcher, everywhere but production. */
const themeTrial = process.env.VERCEL_ENV !== 'production';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: the theme-trial script may set data-theme before React loads.
    <html lang="en" className="dark" style={{ colorScheme: 'dark' }} suppressHydrationWarning>
      {themeTrial && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        </head>
      )}
      <body className="min-h-dvh">
        {children}
        {themeTrial && <ThemeTrial />}
      </body>
    </html>
  );
}
