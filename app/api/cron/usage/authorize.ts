import { timingSafeEqual } from 'node:crypto';

/** Constant-time check of `Authorization: Bearer <secret>`. False when no secret is set. */
export function isAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
