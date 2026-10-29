/**
 * Whether `/dev/<component>` galleries are served (contracts/ui.md: "404 in production").
 *
 * "Production" means the live Vercel deployment (`VERCEL_ENV=production`), not
 * `NODE_ENV=production`: every Vercel build, previews included, runs with
 * NODE_ENV=production, and galleries are meant to be reviewable on PR previews.
 * Galleries render fixtures only, so previews expose no real data.
 *
 * Every gallery page calls this: `if (!isDevGalleryEnabled()) notFound();`
 */
export function isDevGalleryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL_ENV !== 'production';
}
