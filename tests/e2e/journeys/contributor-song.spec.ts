import { expect, test, type Page } from '@playwright/test';

import {
  contributor,
  localServiceClient,
  openWith,
  requireAccount,
  signIn,
  songRow,
  uniqueName,
} from './helpers';

// H-05 journey · A contributor adds a song and finds it in the library (REQ-LIB-01, REQ-SRCH-01).
//
// Songs have no delete for contributors (soft delete is admin-only and has no UI yet), so the
// journey removes its song with the local service role afterwards, and therefore runs only
// against the local stack. Placeholder title and lyrics only.

const startsWith = (name: string) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
const tab = (page: Page, name: string) => page.getByRole('tab', { name: startsWith(name) });
const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name: startsWith(name) });

test('a contributor adds a song with a key and a theme, then finds it by title', async ({
  page,
}, info) => {
  requireAccount(info, contributor);
  const supabase = localServiceClient();
  test.skip(!supabase, 'Cleans up through the local service role; local Supabase stack only');
  test.setTimeout(120_000);

  await signIn(page, contributor, '/songs/new');
  await expect(page.getByRole('heading', { name: 'Add a song' })).toBeVisible();

  const title = uniqueName('E2E journey song');
  let songId: string | null = null;
  try {
    const basic = panel(page, 'Basic info');
    await basic.getByLabel('Title', { exact: true }).fill(title);
    await basic.getByRole('button', { name: 'Add composer' }).click();
    await page.getByPlaceholder('Search composers…').fill('brooke');
    await page
      .getByRole('option', { name: /Brooke Ligertwood/ })
      .first()
      .click();

    // A primary key.
    await tab(page, 'Keys & tempo').click();
    const musical = panel(page, 'Keys & tempo');
    await musical.getByRole('button', { name: 'Add key' }).click();
    const key = musical.getByRole('combobox', { name: 'Key', exact: true }).first();
    await key.click();
    await page.getByRole('option', { name: 'G', exact: true }).click();
    await expect(key).toHaveText('G');

    // Placeholder chorus lyrics and a theme on them.
    await tab(page, 'Lyrics').click();
    await panel(page, 'Lyrics')
      .getByLabel('Chorus', { exact: true })
      .fill('Placeholder chorus line one\nPlaceholder chorus line two');
    await tab(page, 'Themes').click();
    await panel(page, 'Themes').getByRole('button', { name: 'Add theme to Chorus' }).click();
    await page.getByPlaceholder('Search themes…').fill('grace');
    await page.getByRole('option').filter({ hasText: 'grace' }).first().click();
    await expect(panel(page, 'Themes').getByRole('list', { name: 'Chorus themes' })).toContainText(
      'grace',
    );

    await page.getByRole('button', { name: 'Add song' }).click();
    await page.waitForURL(/\/songs\/[0-9a-f-]+\/edit\?created=1/);
    songId = /\/songs\/([0-9a-f-]+)\/edit/.exec(page.url())![1]!;
    await expect(page.getByText('Song added.')).toBeVisible();

    // It is searchable straight away, and its first lines come from the new lyrics.
    await page.goto(`/library?q=${encodeURIComponent(title)}`);
    const row = songRow(page, title);
    await expect(row).toBeVisible({ timeout: 15_000 });
    const firstLines = page.getByRole('dialog', { name: /First lines/ });
    await openWith(row.getByRole('button', { name: new RegExp(`^${title}`) }), firstLines);
    await expect(firstLines).toContainText('Placeholder chorus line one');
    await page.keyboard.press('Escape');

    // And it has its own page.
    await page.goto(`/songs/${songId}`);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  } finally {
    if (songId && supabase) {
      // song_keys, song_themes, resources and branch_usage cascade with the song.
      await supabase.from('audit_log').delete().eq('entity_id', songId);
      const { error } = await supabase.from('songs').delete().eq('id', songId);
      if (error) throw error;
    }
  }
});
