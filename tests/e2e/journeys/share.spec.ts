import { expect, test } from '@playwright/test';

import {
  addToCurrentList,
  createList,
  deleteMyList,
  desktopNav,
  member,
  openMyList,
  openWith,
  overrideKey,
  requireAccount,
  signIn,
  uniqueName,
} from './helpers';

// H-05 journey · Share a setlist and open the link signed out (REQ-SHARE-01, REQ-SHARE-03,
// REQ-NAV-04; SHR-04's Playwright acceptance). The owner creates a link from the nav's Share,
// a fresh browser context with no session opens it and sees the list with the per-event key
// override, and after Revoke the link no longer opens. Deletes the setlist at the end (its
// share links go with it), also when a step fails.

const SONG = 'Holy Spirit'; // keys Bb and A; overridden to E below

test('share a setlist by link; it opens signed out, and not after revoking', async ({
  page,
  browser,
  baseURL,
}, info) => {
  requireAccount(info, member);
  test.setTimeout(120_000);
  await signIn(page, member, '/library');

  const name = uniqueName('E2E journey share');
  const anonymous = await browser.newContext();
  try {
    await createList(page, 'setlist', name);
    await addToCurrentList(page, 'setlist', name, SONG);
    await openMyList(page, 'setlist', name);

    // A per-event override, which the shared page must show (REQ-SHARE-01).
    await overrideKey(page, SONG, 'E');

    // Share from the nav: it acts on the current list (REQ-NAV-04).
    const dialog = page.getByRole('dialog', { name: `Share “${name}”` });
    await openWith(desktopNav(page).getByRole('button', { name: `Share “${name}”` }), dialog);
    await expect(dialog.getByText('No links yet.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Create link' }).click();
    const field = dialog.getByLabel('New link');
    await expect(field).toBeVisible();
    const link = new URL(await field.inputValue());
    expect(link.pathname).toMatch(/^\/share\/[A-Za-z0-9_-]{43}$/);
    // Existing links are listed by prefix only (SHR-05).
    const prefix = link.pathname.slice('/share/'.length, '/share/'.length + 6);
    await expect(dialog.getByText(`Link ${prefix}…`)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // A fresh context with no session opens the link. APP_URL may differ from the server under
    // test, so open the same path here.
    const visitor = await anonymous.newPage();
    const shared = new URL(link.pathname, baseURL).toString();
    const res = await visitor.goto(shared);
    expect(res?.status()).toBe(200);
    expect(new URL(visitor.url()).pathname).toBe(link.pathname); // no redirect to /login
    await expect(visitor.getByRole('heading', { level: 1, name })).toBeVisible();
    const songs = visitor.getByRole('list', { name: `Songs in ${name}` });
    await expect(songs.getByRole('group', { name: SONG, exact: true })).toBeVisible();
    await expect(songs.getByLabel('X, not known').first()).toBeVisible();
    await expect(
      visitor.getByText('This is a read-only copy shared from the Worship Library.'),
    ).toBeVisible();

    // Revoke from the setlist page's Share; the link stops working.
    await openWith(page.getByRole('button', { name: 'Share', exact: true }), dialog);
    await dialog.getByRole('button', { name: `Revoke Link ${prefix}…` }).click();
    await expect(dialog.getByRole('button', { name: `Revoke Link ${prefix}…` })).toBeHidden();
    await expect(dialog.getByText(/Revoked/)).toBeVisible();
    await page.keyboard.press('Escape');

    const after = await visitor.goto(shared);
    expect(after?.status()).toBe(404);
  } finally {
    await anonymous.close();
    await deleteMyList(page, 'setlist', name);
  }
});
