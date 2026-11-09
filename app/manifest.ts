import type { MetadataRoute } from 'next';

/**
 * Web app manifest (H-01; REQ-NF-01 installable PWA). Served at `/manifest.webmanifest`; Next.js
 * adds the `<link rel="manifest">` itself. Icons live in `public/icons/`. Colors match the
 * `--primary` / `--background` tokens in `app/globals.css`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Worship Library',
    short_name: 'Worship Library',
    description: 'The shared song library for People of Praise branches.',
    start_url: '/library',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0f1712',
    theme_color: '#0f1712',
    categories: ['music', 'productivity'],
    icons: [
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      { src: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
    shortcuts: [
      {
        name: 'Setlists',
        url: '/lists',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
  };
}
