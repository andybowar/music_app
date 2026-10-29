/** Where to land after sign-in when no (valid) `next` is given (REQ-NAV-02). */
export const DEFAULT_AFTER_LOGIN = '/library';

const BASE = 'http://app.invalid';

/**
 * Sanitize the `?next=` return path so sign-in can't be used as an open redirect.
 * Only same-origin absolute paths are allowed (`/library?q=x`), never
 * protocol-relative (`//evil.test`), backslash tricks (`/\evil.test`), other
 * schemes, or a return to the auth pages themselves.
 */
export function safeNext(value: string | string[] | undefined | null): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) {
    return DEFAULT_AFTER_LOGIN;
  }
  // Browsers strip tabs/newlines, which would turn `/\t/x` into `//x`.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return DEFAULT_AFTER_LOGIN;

  const url = new URL(raw, BASE);
  if (url.origin !== BASE) return DEFAULT_AFTER_LOGIN;
  if (/^\/(login|reset|auth)(\/|$)/.test(url.pathname)) return DEFAULT_AFTER_LOGIN;
  return `${url.pathname}${url.search}${url.hash}`;
}
