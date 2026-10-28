import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Playwright and Supabase auth redirects use 127.0.0.1 rather than localhost.
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    serverActions: {
      // Uploads go straight to Storage via signed URLs; actions only carry metadata.
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
