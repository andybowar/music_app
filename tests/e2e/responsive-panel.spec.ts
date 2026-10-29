import { expect, test } from '@playwright/test';

// UI-01 · ResponsivePanel is a popover at >= 768px and a bottom sheet below (contracts/ui.md).
// It is exercised through the /dev/tokens gallery, which calls notFound() in production. The e2e
// workflow runs against Vercel preview deployments (production builds), so there the page 404s
// and this spec skips itself. It runs wherever the dev gallery is served (`pnpm dev`, local e2e).
const GALLERY = '/dev/tokens';

const CASES = [
  { width: 360, mode: 'sheet' },
  { width: 767, mode: 'sheet' },
  { width: 768, mode: 'popover' },
  { width: 1280, mode: 'popover' },
] as const;

test.describe('ResponsivePanel viewport switch', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(GALLERY);
    test.skip(res.status() === 404, `${GALLERY} is dev-only (404 in production builds)`);
    expect(res.ok()).toBe(true);
  });

  for (const { width, mode } of CASES) {
    test(`is a ${mode} at ${width}px and keyboard accessible`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(GALLERY);
      // The gallery mirrors the media-query result once hydrated.
      await expect(page.getByTestId('panel-mode')).toHaveText(mode);

      // includeHidden: the modal sheet aria-hides the rest of the page while open.
      const trigger = page.getByRole('button', { name: 'Key D', includeHidden: true });
      await trigger.focus();
      await page.keyboard.press('Enter');

      const panel = page.getByRole('dialog', { name: 'Keys' });
      await expect(panel).toBeVisible();
      await expect(panel).toHaveAttribute('data-mode', mode);
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      expect(await panel.evaluate((el) => el.contains(document.activeElement))).toBe(true);

      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      await expect(trigger).toBeFocused();
    });
  }

  test('keeps the panel open and switches mode when resized across 768px', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto(GALLERY);
    await expect(page.getByTestId('panel-mode')).toHaveText('popover');
    await page.getByRole('button', { name: 'Key D' }).click();
    const panel = page.getByRole('dialog', { name: 'Keys' });
    await expect(panel).toHaveAttribute('data-mode', 'popover');

    await page.setViewportSize({ width: 400, height: 800 });
    await expect(page.getByRole('dialog', { name: 'Keys' })).toHaveAttribute('data-mode', 'sheet');
  });
});
