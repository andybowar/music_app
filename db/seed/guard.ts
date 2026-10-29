/**
 * Safety guard for the seed (DB-04): it only writes to a local stack unless forced.
 * Pure, so it is unit tested without a database.
 */

/** Hostnames that count as "this machine". */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export class SeedTargetError extends Error {
  override name = 'SeedTargetError';
}

/** True when `url` parses and its host is a loopback name or address. */
export function isLocalUrl(url: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Throws `SeedTargetError` unless every target URL is local, or `force` is set.
 * Error messages name the variable but never echo the URL (it may hold a password).
 */
export function assertLocalTargets(targets: Record<string, string | undefined>, force: boolean) {
  const missing = Object.entries(targets)
    .filter(([, url]) => !url)
    .map(([name]) => name);
  if (missing.length) throw new SeedTargetError(`Seed needs ${missing.join(', ')} to be set.`);
  if (force) return;
  const remote = Object.entries(targets)
    .filter(([, url]) => !isLocalUrl(url!))
    .map(([name]) => name);
  if (remote.length) {
    throw new SeedTargetError(
      `Refusing to seed: ${remote.join(', ')} is not localhost. ` +
        'The seed is for local development only; pass --force to override.',
    );
  }
}
