import { expect, test } from '@playwright/test';

// PLAY-05 · A playlist plays its songs in order and auto-advances (REQ-LIST-05). Exercised through
// the /dev/playlist gallery: PlaylistView over the Background 1 fixture with two silent MP3s
// (data URLs) played by the real MP3 adapter. The second one is keyed to a non-primary key, so it
// is only playable because the view gets the song details (CR PLAY-05). The gallery 404s only on
// the live production deployment (lib/devGallery.ts), where this spec skips itself.
const GALLERY = '/dev/playlist';

test.describe('Playlist playback', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(GALLERY);
    test.skip(
      res.status() === 404,
      `${GALLERY} is not served here (404 on the production deployment)`,
    );
    expect(res.ok()).toBe(true);
  });

  test('plays all, auto-advances to the next track, then finishes', async ({ page }) => {
    await page.goto(GALLERY);
    const songs = page.getByRole('list', { name: /^Songs in / });
    await expect(songs.getByRole('listitem')).toHaveCount(3);
    await expect(page.getByText(/3 songs · 1 without a recording \(skipped\)/)).toBeVisible();

    const player = page.getByRole('region', { name: 'Player' });
    await page.getByRole('button', { name: 'Play all' }).click();

    await expect(player).toHaveAttribute('data-status', 'playing');
    await expect(player.getByText('Track 1 of 2')).toBeVisible();
    await expect(songs.getByRole('listitem').nth(0)).toHaveAttribute('aria-current', 'true');

    // Track 1 is about a second long; the player moves on by itself.
    await expect(player.getByText('Track 2 of 2')).toBeVisible({ timeout: 10_000 });
    await expect(player).toHaveAttribute('data-status', 'playing');
    await expect(songs.getByRole('listitem').nth(1)).toHaveAttribute('aria-current', 'true');

    // The third row has no recording, so the list finishes after track 2.
    await expect(player).toHaveAttribute('data-status', 'ended', { timeout: 10_000 });
    await expect(player.getByText('Finished')).toBeVisible();
  });
});
