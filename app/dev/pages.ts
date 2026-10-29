import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export interface DevRoute {
  path: string;
  /** Under `app/(app)/`, so the layout's requireUser sends signed-out users to /login. */
  needsSignIn: boolean;
}

/**
 * Maps a page file (relative to `app/`) to its URL. Route groups like `(auth)`
 * drop out. Returns null for dynamic routes (`[id]`), which have no fixed URL.
 */
export function routeFromPageFile(relPath: string): DevRoute | null {
  const segments = relPath.split(/[\\/]/).slice(0, -1);
  if (segments.some((s) => s.startsWith('['))) return null;
  const path = '/' + segments.filter((s) => !(s.startsWith('(') && s.endsWith(')'))).join('/');
  return { path, needsSignIn: segments[0] === '(app)' };
}

function findPageFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return findPageFiles(full);
    return /^page\.(t|j)sx?$/.test(entry.name) ? [full] : [];
  });
}

/** Every static page under `appDir`, sorted by path. */
export function discoverRoutes(appDir: string): DevRoute[] {
  return findPageFiles(appDir)
    .map((file) => routeFromPageFile(relative(appDir, file).split(sep).join('/')))
    .filter((r): r is DevRoute => r !== null)
    .sort((a, b) => a.path.localeCompare(b.path));
}
