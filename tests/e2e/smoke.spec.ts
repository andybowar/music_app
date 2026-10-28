import { expect, test } from '@playwright/test';

test('root redirects to /library', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/library$/);
});
