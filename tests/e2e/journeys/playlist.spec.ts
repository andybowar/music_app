import { expect, test } from '@playwright/test';

import { SILENT_MP3_SHORT } from '../../../app/dev/playlist/silentAudio';
import songsJson from '../../../fixtures/songs.json' with { type: 'json' };

import {
  addToCurrentList,
  createList,
  deleteMyList,
  ensureLocalFile,
  member,
  openMyList,
  requireAccount,
  signIn,
  uniqueName,
} from './helpers';

// H-05 journey · Build a listening playlist, pick a recording and play it to the end
// (REQ-LIST-05). "A Thousand Hallelujahs" has a seeded MP3 resource ("MP3 D 1") but no file, so
// on the local stack the journey uploads a ~1 s silent MP3 (the /dev/playlist gallery's) to its
// Storage path and removes it afterwards if it was not there before. Deletes the playlist at the
// end, also when a step fails.

const SONG = 'A Thousand Hallelujahs';
const RECORDING = 'MP3 D 1';

test('create a playlist, pick a recording, play all to the end', async ({ page }, info) => {
  requireAccount(info, member);
  test.setTimeout(120_000);

  const mp3 = songsJson
    .find((s) => s.title === SONG)!
    .resources.find((r) => r.kind === 'audio' && r.format === 'mp3')!;
  const bytes = Buffer.from(SILENT_MP3_SHORT.split(',')[1]!, 'base64');
  const cleanUp = await ensureLocalFile(mp3.storagePath!, bytes, 'audio/mpeg');

  await signIn(page, member, '/library');
  const name = uniqueName('E2E journey playlist');
  try {
    await createList(page, 'playlist', name);
    await addToCurrentList(page, 'playlist', name, SONG);
    await openMyList(page, 'playlist', name);

    // Nothing to play until a recording is chosen.
    const playAll = page.getByRole('button', { name: 'Play all' });
    await expect(playAll).toBeDisabled();
    await page.getByLabel(`Recording for ${SONG}`).selectOption({ label: RECORDING });
    await expect(playAll).toBeEnabled();
    // The choice is saved on the list item.
    await page.waitForLoadState('networkidle');
    await page.reload();
    await expect(page.getByLabel(`Recording for ${SONG}`)).toHaveValue(mp3.id);

    const player = page.getByRole('region', { name: 'Player' });
    await page.getByRole('button', { name: 'Play all' }).click();
    await expect(player).toHaveAttribute('data-status', 'playing', { timeout: 15_000 });
    await expect(player.getByText('Track 1 of 1')).toBeVisible();
    await expect(player).toHaveAttribute('data-status', 'ended', { timeout: 15_000 });
    await expect(player.getByText('Finished')).toBeVisible();
  } finally {
    await deleteMyList(page, 'playlist', name);
    await cleanUp();
  }
});
