import { expect, test } from '@playwright/test';

import { desktopNav, member, requireAccount, signIn } from './helpers';

// H-05 journey · Sign in and find the way around (REQ-AUTH-02, REQ-NAV-01).
//
// SSO (OIDC/SAML) needs a real identity provider, so the journeys sign in with email and
// password, the local stand-in. Creates nothing. It doesn't sign out: Supabase's sign-out ends
// every session of the account, which would sign out the journeys running alongside it.
// Sign-out, reset and the SSO buttons are covered in tests/e2e/auth-login.spec.ts.

test('a member signs in and sees every nav action', async ({ page }, info) => {
  requireAccount(info, member);
  await signIn(page, member, '/library');
  await expect(page.getByRole('heading', { level: 1, name: 'Worship Library' })).toBeVisible();

  const nav = desktopNav(page);
  for (const name of ['Home', 'Search library', 'Open setlist', 'Open playlist']) {
    await expect(nav.getByRole('link', { name })).toBeVisible();
  }
  for (const name of ['Create event setlist', 'Create listening playlist']) {
    await expect(nav.getByRole('button', { name })).toBeEnabled();
  }
  // Share acts on the current list, and is disabled when there is none (REQ-NAV-04).
  await expect(nav.getByRole('button', { name: /^Share/ })).toBeVisible();
});
