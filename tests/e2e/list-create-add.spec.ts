import { expect, test, type Page } from '@playwright/test';

// LIST-09 · Create a list from the nav and add songs from the library (REQ-LIST-01, REQ-LIST-02,
// REQ-NAV-01). CR LIST-09-e2e-spec.
//
// Creates real rows, so it only runs when a test account is supplied (never on a shared preview
// by default):
//   E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD - an approved member
// e.g. against `pnpm dev` on a local stack after `pnpm db:reset && pnpm db:migrate && pnpm db:seed`
// (seeded users sign in with DEV_PASSWORD from db/seed/data.ts).

const member = { email: process.env.E2E_MEMBER_EMAIL, password: process.env.E2E_MEMBER_PASSWORD };

async function signIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next);
}

const ADD_LABEL = /^Add “(.+)” to a list$/;

test.describe('create a setlist and add songs', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'chromium', 'Creates real rows; desktop Chromium only');
  });

  test('Create event setlist → search → add 3 songs → open setlist shows 3 in order', async ({
    page,
  }) => {
    test.skip(
      !member.email || !member.password,
      'Set E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD to run against a seeded stack',
    );
    test.setTimeout(90_000);
    await signIn(page, member.email!, member.password!, '/library');

    // Create from the nav; the new setlist becomes current and we land on the library.
    const name = `E2E setlist ${Date.now()}`;
    const nav = page.getByTestId('nav-desktop');
    await nav.getByRole('button', { name: 'Create event setlist' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create event setlist' });
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByRole('button', { name: 'Create setlist' }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/library$/);
    await expect(nav.getByRole('button', { name: `Share “${name}”` })).toBeEnabled();

    // Search (sort A–Z); adding must keep these params.
    await page.goto('/library?sort=alpha');
    const addButtons = page.getByRole('button', { name: ADD_LABEL });
    await expect(addButtons.nth(2)).toBeVisible();
    const url = page.url();

    const titles: string[] = [];
    for (let i = 0; i < 3; i++) {
      const button = addButtons.nth(i);
      const label = (await button.getAttribute('aria-label')) ?? '';
      titles.push(ADD_LABEL.exec(label)?.[1] ?? '');
      const current = page.getByRole('menuitem', { name: `Event: ${name}` });
      // Retry the open: a click that lands before hydration does nothing.
      await expect(async () => {
        if (!(await current.isVisible())) await button.click();
        await expect(current).toBeVisible({ timeout: 2_000 });
      }).toPass();
      await current.click();
      await expect(page.getByText(`Added to Event: ${name}`).first()).toBeVisible();
      await expect(addButtons.nth(i)).toHaveAttribute('aria-label', label);
    }
    expect(titles.every(Boolean)).toBe(true);
    expect(page.url()).toBe(url);

    // Open setlist → the new list shows the three songs in the order added.
    await nav.getByRole('link', { name: 'Open setlist' }).click();
    await page.getByRole('link', { name }).first().click();
    const songs = page.getByRole('list', { name: `Songs in ${name}` }).locator(':scope > li');
    await expect(songs).toHaveCount(3);
    for (const [i, title] of titles.entries()) {
      await expect(songs.nth(i)).toContainText(title);
    }
  });
});
