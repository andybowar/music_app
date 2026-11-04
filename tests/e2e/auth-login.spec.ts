import { expect, test, type Page } from '@playwright/test';

// AUTH-01 · Password login, logout, reset (REQ-AUTH-02, REQ-NAV-02). CR AUTH-01-reset-redirect-
// and-e2e §3.
//
// Two groups:
//  1. Signed out. Needs no account and writes nothing, so it runs everywhere, Vercel previews
//     included: form validation, the generic wrong-password error, the redirect to
//     `/login?next=`, the reset request form and the invalid reset link state.
//  2. Signed in, against a real, seeded stack. Runs only when a test account is supplied:
//       E2E_USER_EMAIL / E2E_USER_PASSWORD     - any approved user
//       (falls back to E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD, as the other specs use)
//     e.g. against `pnpm dev` on a local stack after `pnpm db:reset && pnpm db:migrate &&
//     pnpm db:seed`: seeded users are `<role>.<branch>@example.com` and sign in with DEV_PASSWORD
//     from db/seed/data.ts.

const user = {
  email: process.env.E2E_USER_EMAIL ?? process.env.E2E_MEMBER_EMAIL,
  password: process.env.E2E_USER_PASSWORD ?? process.env.E2E_MEMBER_PASSWORD,
};

/** Generic sign-in failure (no user enumeration): the same for unknown emails and bad passwords. */
const BAD_CREDENTIALS = 'Incorrect email or password.';
/** `RESET_SENT_MESSAGE` in features/auth/ui/ResetForms.tsx. */
const RESET_SENT =
  "If an account exists for that email, we've sent a link to reset your password. Check your inbox.";

/** An address that has no account anywhere (`.invalid` is reserved, RFC 2606). */
const nobody = (tag: string) => `nobody.${tag}.${Date.now().toString(36)}@example.invalid`;

/**
 * Waits until React has hydrated the page's form. Before that, a submit is a native GET that
 * would put the typed password in the URL, so every spec here waits before typing.
 */
async function formReady(page: Page) {
  await page.waitForFunction(() => {
    const form = document.querySelector('main form');
    return !!form && Object.keys(form).some((k) => k.startsWith('__reactProps'));
  });
}

async function fillLogin(page: Page, email: string, password: string) {
  await formReady(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
}

/** The page's own alert, not Next.js's (empty) route announcer, which also has role="alert". */
const formAlert = (page: Page) =>
  page.getByRole('alert').and(page.locator(':not(#__next-route-announcer__)'));

async function submitLogin(page: Page) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

// ---------------------------------------------------------------------------------------------
// 1. Signed out
// ---------------------------------------------------------------------------------------------

test.describe('sign-in pages, signed out', () => {
  test('an empty submit shows both field errors and stays on /login', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await formReady(page);
    await submitLogin(page);
    await expect(page.getByText('Enter your email address.')).toBeVisible();
    await expect(page.getByText('Enter your password.')).toBeVisible();
    await expect(page.getByLabel('Email')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.search === '');
  });

  test('an unknown account gets the generic error, and the password is cleared', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'chromium', 'Calls Supabase Auth; desktop Chromium only');
    await page.goto('/login');
    await fillLogin(page, nobody('login'), 'not-the-password');
    await submitLogin(page);
    await expect(formAlert(page)).toHaveText(BAD_CREDENTIALS);
    await expect(page.getByLabel('Password')).toHaveValue('');
    await expect(page).toHaveURL((url) => url.pathname === '/login' && url.search === '');
  });

  test('a protected page redirects to /login?next=', async ({ page }) => {
    await page.goto('/lists?type=setlist');
    await expect(page).toHaveURL((url) => url.pathname === '/login');
    expect(new URL(page.url()).searchParams.get('next')).toBe('/lists?type=setlist');
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });

  test('"Forgot your password?" opens the reset request form, which validates the email', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot your password?' }).click();
    await page.waitForURL((url) => url.pathname === '/reset');
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();

    await formReady(page);
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();

    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await page.waitForURL((url) => url.pathname === '/login');
  });

  test('a reset request shows the same confirmation whether or not the account exists', async ({
    page,
  }, info) => {
    // Supabase sends no email for an unknown address, so this is safe on hosted previews.
    test.skip(info.project.name !== 'chromium', 'Calls Supabase Auth; desktop Chromium only');
    await page.goto('/reset');
    await formReady(page);
    await page.getByLabel('Email').fill(nobody('reset'));
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toHaveText(RESET_SENT);
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toBeVisible();
  });

  test('a reset link without a code shows the invalid-link state', async ({ page }) => {
    await page.goto('/reset/confirm');
    await expect(page.getByRole('heading', { name: 'Reset link expired' })).toBeVisible();
    await expect(formAlert(page)).toContainText('This reset link is invalid or has expired');
    await page.getByRole('link', { name: 'Request a new reset link' }).click();
    await page.waitForURL((url) => url.pathname === '/reset');
  });

  test('a bogus reset code is rejected when the new password is submitted', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'chromium', 'Calls Supabase Auth; desktop Chromium only');
    await page.goto('/reset/confirm?code=e2e-bogus-code');
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    await formReady(page);
    await page.getByLabel('New password', { exact: true }).fill('e2e-new-password');
    await page.getByLabel('Confirm new password').fill('e2e-new-password');
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(formAlert(page)).toHaveText(
      'This reset link is invalid or has expired. Request a new one.',
    );
    await expect(page.getByRole('link', { name: 'Request a new reset link' })).toBeVisible();
    await expect(page).toHaveURL((url) => url.pathname === '/reset/confirm');
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Signed in, against a seeded stack
// ---------------------------------------------------------------------------------------------

test.describe('sign-in on a seeded stack', () => {
  test.beforeEach(() => {
    // A first visit to /library compiles on demand under `next dev`.
    test.setTimeout(90_000);
    test.skip(
      !user.email || !user.password,
      'Set E2E_USER_EMAIL / E2E_USER_PASSWORD (or E2E_MEMBER_*) to run against a seeded stack',
    );
  });

  test('email and password sign-in lands on /library; sign out returns to /login', async ({
    page,
  }) => {
    await page.goto('/login');
    await fillLogin(page, user.email!, user.password!);
    // Keyboard submit (Enter in the password field).
    await page.getByLabel('Password').press('Enter');
    await page.waitForURL((url) => url.pathname === '/library');

    const account = page.getByRole('button', { name: 'Account' });
    await expect(async () => {
      await account.click();
      await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeVisible({
        timeout: 1_000,
      });
    }).toPass();
    await expect(page.getByRole('menu')).toContainText(user.email!);
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.waitForURL((url) => url.pathname === '/login');

    // The session is gone: a protected page sends us back to sign in.
    await page.goto('/library');
    await expect(page).toHaveURL((url) => url.pathname === '/login');
    expect(new URL(page.url()).searchParams.get('next')).toBe('/library');
  });

  test('a wrong password gets the generic error and stays on /login', async ({ page }, info) => {
    test.skip(info.project.name !== 'chromium', 'Calls Supabase Auth; desktop Chromium only');
    await page.goto('/login');
    await fillLogin(page, user.email!, `${user.password!}-wrong`);
    await submitLogin(page);
    await expect(formAlert(page)).toHaveText(BAD_CREDENTIALS);
    await expect(page).toHaveURL((url) => url.pathname === '/login');
  });

  test('sign-in honours a safe ?next= and ignores an off-site one', async ({ page, baseURL }) => {
    await page.goto(`/login?next=${encodeURIComponent('/lists?type=setlist')}`);
    await fillLogin(page, user.email!, user.password!);
    await submitLogin(page);
    await page.waitForURL((url) => url.pathname === '/lists');
    expect(new URL(page.url()).searchParams.get('type')).toBe('setlist');

    // Signed in already, so start a fresh session for the second case.
    await page.context().clearCookies();
    await page.goto(`/login?next=${encodeURIComponent('//evil.test/library')}`);
    await fillLogin(page, user.email!, user.password!);
    await submitLogin(page);
    await page.waitForURL((url) => url.pathname === '/library');
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
  });
});
