import { expect, test } from '@playwright/test';

import { buildSamplePdf } from '../../../components/media/sampleMedia';
import songsJson from '../../../fixtures/songs.json' with { type: 'json' };

import { ensureLocalFile, member, openWith, requireAccount, signIn, songRow } from './helpers';

// H-05 journey · Find a song by theme and open its chord chart (REQ-SRCH-01, REQ-ROW-04).
//
// "At the Cross" is tagged "redemption" in the seed. The seed has resource rows but no files,
// so on the local stack the journey uploads a generated placeholder PDF for that chart (never
// against a hosted project) and removes it afterwards if it was not there before.

const SONG = 'At the Cross';
const THEME = 'redemption';

test('theme search → song → Resources → chord chart opens', async ({ page }, info) => {
  requireAccount(info, member);
  test.setTimeout(90_000);

  const chart = songsJson
    .find((s) => s.title === SONG)!
    .resources.find((r) => r.kind === 'chord_chart' && r.format === 'pdf')!;
  const cleanUp = await ensureLocalFile(
    chart.storagePath!,
    Buffer.from(buildSamplePdf(2), 'latin1'),
    'application/pdf',
  );
  try {
    await signIn(page, member, '/library');

    // Themes only: switch the other search fields off, then search.
    const search = page.getByRole('search', { name: 'Song search' });
    for (const field of ['Titles', 'Lyrics', 'Composer']) {
      const toggle = search.getByRole('button', { name: field, exact: true });
      await expect(async () => {
        if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
        await expect(toggle).toHaveAttribute('aria-pressed', 'false', { timeout: 2_000 });
      }).toPass();
    }
    const box = search.getByLabel('Search songs');
    await box.fill(THEME);
    await box.press('Enter');
    await expect(page).toHaveURL(/[?&]fields=themes(&|$)/);
    await expect(page).toHaveURL(new RegExp(`[?&]q=${THEME}(&|$)`));
    const row = songRow(page, SONG);
    await expect(row).toBeVisible();

    // Resources → chord chart → the PDF viewer renders it.
    const panel = page.getByRole('dialog', { name: 'Resources' });
    await openWith(row.getByRole('button', { name: /Resources/ }), panel);
    await panel
      .getByRole('button', { name: /^Chord chart, .*opens viewer$/ })
      .first()
      .click();
    const viewer = page.getByRole('dialog', { name: `${SONG} · Chord chart` });
    await expect(viewer).toBeVisible();
    await expect(viewer.getByRole('status', { name: 'Loading PDF' })).toBeHidden({
      timeout: 15_000,
    });
    await expect(viewer.getByRole('alert')).toHaveCount(0);
    await viewer.getByRole('button', { name: 'Close' }).click();
    await expect(viewer).toBeHidden();

    // The search is still there after closing.
    await expect(box).toHaveValue(THEME);
  } finally {
    await cleanUp();
  }
});
