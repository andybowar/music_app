import { expect, test, type Locator, type Page } from '@playwright/test';

// LIST-07 · One setlist: reorder and per-event overrides (REQ-LIST-03, REQ-LIST-04).
// CR LIST-07-setlist-extras.
//
// Two groups:
//  1. `/dev/setlist` gallery: SetlistView on fixture "BG 4/19/26" with fixture-backed list
//     actions. Runs locally and on every Vercel preview, and skips itself wherever the gallery
//     404s (production).
//  2. The acceptance scenarios against a real, seeded stack. They create (and then delete) a
//     setlist, so they only run when a test account is supplied:
//       E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD - an approved member
//     e.g. against `pnpm dev` on a local stack after `pnpm db:reset && pnpm db:migrate &&
//     pnpm db:seed` (seeded users sign in with DEV_PASSWORD from db/seed/data.ts).

const GALLERY = '/dev/setlist';

/** "Holy Spirit" has keys Bb and A only, so E has no chords or files. */
const NO_E = 'Holy Spirit';

const songList = (page: Page, name: string) => page.getByRole('list', { name: `Songs in ${name}` });
const rows = (page: Page, name: string) => songList(page, name).locator(':scope > li');
const rowOf = (page: Page, name: string, title: string) =>
  rows(page, name).filter({ has: page.getByRole('group', { name: title, exact: true }) });

/** Picks a row action; retries the menu open, since a click before hydration does nothing. */
async function rowAction(page: Page, title: string, action: string) {
  const trigger = page.getByRole('button', { name: `Actions for ${title}` });
  const item = page.getByRole('menuitem', { name: action });
  await expect(async () => {
    if (!(await item.isVisible())) await trigger.click();
    await expect(item).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await item.click();
}

async function expectOrder(page: Page, name: string, titles: string[]) {
  const list = rows(page, name);
  await expect(list).toHaveCount(titles.length);
  for (const [i, title] of titles.entries()) {
    await expect(list.nth(i).getByRole('group', { name: title, exact: true })).toBeVisible();
  }
}

/** Overrides the row's key to E, then checks the X chords and the upload prompt. */
async function overrideToE(page: Page, row: Locator, title: string) {
  await rowAction(page, title, 'Change key, BPM or energy');
  const editor = page.getByTestId('item-override-editor');
  await editor.getByLabel('Key', { exact: true }).selectOption('E');
  await expect(editor.getByRole('link', { name: 'Upload files for E' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  await expect(page.getByRole('button', { name: `Actions for ${title}` })).toBeFocused();
  await expectXAndUpload(row);
}

async function expectXAndUpload(row: Locator) {
  await expect(row.getByLabel('X, not known').first()).toBeVisible();
  await expect(row.getByRole('link', { name: 'Upload files for E' })).toBeVisible();
}

// ---------------------------------------------------------------------------------------------
// 1. Gallery
// ---------------------------------------------------------------------------------------------

test.describe('setlist gallery', () => {
  const LIST = 'BG 4/19/26';

  test.beforeEach(async ({ page, request }) => {
    const res = await request.get(GALLERY);
    test.skip(
      res.status() === 404,
      `${GALLERY} is not served here (404 on the production deployment)`,
    );
    expect(res.ok()).toBe(true);
    await page.goto(GALLERY);
    await expect(songList(page, LIST)).toBeVisible();
  });

  test('Move down reorders the rows', async ({ page }) => {
    await expectOrder(page, LIST, [
      'Cause to Celebrate',
      'Holy Spirit',
      'Be the Center',
      'A Thousand Hallelujahs',
    ]);
    await rowAction(page, 'Cause to Celebrate', 'Move down');
    await expect(page.getByTestId('action-log')).toContainText('reorderList(4 items)');
    await expectOrder(page, LIST, [
      'Holy Spirit',
      'Cause to Celebrate',
      'Be the Center',
      'A Thousand Hallelujahs',
    ]);
  });

  test('override to E on a song lacking E shows X and the upload prompt', async ({ page }) => {
    await overrideToE(page, rowOf(page, LIST, NO_E), NO_E);
  });

  test('read-only hides the row actions', async ({ page }) => {
    await page.getByLabel('State').selectOption('read-only');
    await expect(page.getByText(/^View only\./)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Actions for / })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Acceptance scenarios against a real stack
// ---------------------------------------------------------------------------------------------

const member = { email: process.env.E2E_MEMBER_EMAIL, password: process.env.E2E_MEMBER_PASSWORD };

async function signIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next);
}

/** Adds a song to the current list from the library's ADD button. */
async function addSong(page: Page, listName: string, title: string) {
  await page.goto(`/library?q=${encodeURIComponent(title)}`);
  const button = page.getByRole('button', { name: `Add “${title}” to a list` });
  const current = page.getByRole('menuitem', { name: `Event: ${listName}` });
  await expect(async () => {
    if (!(await current.isVisible())) await button.click();
    await expect(current).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await current.click();
  await expect(page.getByText(`Added to Event: ${listName}`).first()).toBeVisible();
}

test.describe('setlist on a seeded stack', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'chromium', 'Creates real rows; desktop Chromium only');
    test.skip(
      !member.email || !member.password,
      'Set E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD to run against a seeded stack',
    );
  });

  test('reorder persists; override to E on a song lacking E shows X and the upload prompt', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await signIn(page, member.email!, member.password!, '/library');

    // A fresh setlist (it becomes current) with two songs that have no E.
    const name = `E2E setlist ${Date.now()}`;
    const nav = page.getByTestId('nav-desktop');
    await nav.getByRole('button', { name: 'Create event setlist' }).click();
    const dialog = page.getByRole('dialog', { name: 'Create event setlist' });
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByRole('button', { name: 'Create setlist' }).click();
    await expect(dialog).toBeHidden();
    await addSong(page, name, 'Agnus Dei');
    await addSong(page, name, NO_E);

    await page.goto('/lists?type=setlist&scope=mine');
    await page.getByRole('link', { name }).first().click();
    await page.waitForURL(/\/lists\/[0-9a-f-]+$/);
    await expectOrder(page, name, ['Agnus Dei', NO_E]);

    // Reorder persists across a reload.
    await rowAction(page, NO_E, 'Move up');
    await expectOrder(page, name, [NO_E, 'Agnus Dei']);
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expectOrder(page, name, [NO_E, 'Agnus Dei']);

    // Override to E: X chords and the upload prompt, also after a reload.
    await overrideToE(page, rowOf(page, name, NO_E), NO_E);
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expectXAndUpload(rowOf(page, name, NO_E));

    // Clean up.
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete setlist' }).click();
    await page.waitForURL((url) => url.pathname === '/lists');
  });
});
