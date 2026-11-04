import { expect, test, type Page } from '@playwright/test';

import {
  addToCurrentList,
  createList,
  deleteMyList,
  member,
  openMyList,
  openWith,
  overrideKey,
  requireAccount,
  signIn,
  uniqueName,
} from './helpers';

// H-05 journey · Build a setlist: create it from the nav, add songs from search, reorder them,
// and change one song's key for the event (REQ-LIST-01..04). Deletes the setlist at the end,
// also when a step fails.

/** "Holy Spirit" has keys Bb and A only, so an override to E has no chords or files. */
const SONGS = ['Agnus Dei', 'Holy Spirit'] as const;

const rows = (page: Page, name: string) =>
  page.getByRole('list', { name: `Songs in ${name}` }).locator(':scope > li');

async function expectOrder(page: Page, name: string, titles: readonly string[]) {
  const list = rows(page, name);
  await expect(list).toHaveCount(titles.length);
  for (const [i, title] of titles.entries()) {
    await expect(list.nth(i).getByRole('group', { name: title, exact: true })).toBeVisible();
  }
}

async function rowAction(page: Page, title: string, action: string) {
  await openWith(
    page.getByRole('button', { name: `Actions for ${title}` }),
    page.getByRole('menuitem', { name: action }),
  );
  await page.getByRole('menuitem', { name: action }).click();
}

test('create a setlist, add two songs, reorder them and override a key', async ({ page }, info) => {
  requireAccount(info, member);
  test.setTimeout(120_000);
  await signIn(page, member, '/library');

  const name = uniqueName('E2E journey setlist');
  try {
    await createList(page, 'setlist', name);
    for (const title of SONGS) await addToCurrentList(page, 'setlist', name, title);

    await openMyList(page, 'setlist', name);
    await expectOrder(page, name, SONGS);

    // Reorder: Holy Spirit up to first; it sticks after a reload.
    await rowAction(page, 'Holy Spirit', 'Move up');
    await expectOrder(page, name, ['Holy Spirit', 'Agnus Dei']);
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expectOrder(page, name, ['Holy Spirit', 'Agnus Dei']);

    // Override the key to E for this event: X chords and an upload prompt, kept on reload.
    await overrideKey(page, 'Holy Spirit', 'E');
    await page.reload();
    const first = rows(page, name).first();
    await expect(first.getByLabel('X, not known').first()).toBeVisible();
    await expect(first.getByRole('link', { name: 'Upload files for E' })).toBeVisible();
  } finally {
    await deleteMyList(page, 'setlist', name);
  }
});
