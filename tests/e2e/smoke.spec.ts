import { expect, test } from '@playwright/test';

// REQ-NAV-02: `/` lands on the Worship Library. This browser is signed out, so the
// middleware then sends it to sign-in with `next` pointing back at the library.
test('root sends signed-out visitors to sign in for /library', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?next=%2Flibrary$/);
});
