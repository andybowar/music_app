import { expect, test, type Page } from '@playwright/test';

// LIST-11 · Play from a setlist song: the full-screen set player (REQ-LIST-09).
//
//  1. `/dev/set-player` gallery: fixture songs and generated sample PDFs. Runs locally and on
//     every Vercel preview; skips itself where the gallery 404s (production).
//  2. A seeded setlist on a real stack ("BG 4/19/26", readable by every member). It only reads,
//     so nothing needs cleaning up. Needs E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD.

const GALLERY = '/dev/set-player';
const SEEDED_LIST = '/lists/80000000-0000-4000-8000-000000000001';

const player = (page: Page) => page.getByRole('dialog', { name: /BG 4\/19\/26/ });

/**
 * Clicks a Play button (retrying until hydrated), which opens the player straight away. `play` is
 * the gallery's Play button, or a setlist row's "Play <title>" (the first song's by default).
 */
async function start(page: Page, play = page.getByRole('button', { name: /^Play\b/ }).first()) {
  await expect(async () => {
    if (!(await player(page).isVisible())) await play.click();
    await expect(player(page)).toBeVisible({ timeout: 2_000 });
  }).toPass();
}

test.describe('set player gallery', () => {
  test.beforeEach(async ({ page, request }) => {
    const res = await request.get(GALLERY);
    test.skip(res.status() === 404, `${GALLERY} is not served here (404 on production)`);
    await page.goto(GALLERY);
  });

  test('asks which chart, pages through it, then moves on', async ({ page }) => {
    await start(page);
    const p = player(page);
    await expect(p.locator('header').getByText('Song 1 of 6')).toBeVisible();
    await expect(p.getByRole('heading', { name: 'Which chart?' })).toBeVisible();
    await p.getByRole('button', { name: 'Typed chords (in G)' }).click();
    await expect(p.locator('[data-chords]').first()).toBeVisible();

    await p.getByRole('button', { name: 'Choose another chart' }).click();
    await p.getByRole('button', { name: /^Chord chart/ }).click();
    await expect(p.getByRole('img', { name: /page 1 of 4$/ })).toBeVisible({ timeout: 15_000 });

    // The pedal scrolls the chart first, and only then turns to the next song.
    const scroll = p.getByTestId('player-scroll');
    await scroll.click({ position: { x: 4, y: 4 } });
    await page.keyboard.press('PageDown');
    await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await expect(p.locator('header').getByText('Song 1 of 6')).toBeVisible();
    await expect(async () => {
      await page.keyboard.press('PageDown');
      await expect(p.locator('header').getByText('Song 2 of 6')).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await expect(p.getByText('No chord chart for this song.')).toBeVisible();
  });

  test('autoscroll moves the page and switches off on the next song', async ({ page }) => {
    await start(page);
    const p = player(page);
    await p.getByRole('button', { name: 'Typed chords (in G)' }).click();
    await p.getByRole('button', { name: 'Larger text' }).click();
    await p.getByRole('button', { name: 'Larger text' }).click();
    await p.getByRole('slider').fill('10');
    const scroll = p.getByTestId('player-scroll');
    await p.getByRole('button', { name: 'Autoscroll' }).click();
    await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(20);
    await p.getByRole('button', { name: /^Next/ }).click();
    await expect(p.getByRole('button', { name: 'Autoscroll' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(p.getByRole('slider')).toHaveValue('3');
  });

  test('has no role picker or menu; Escape exits', async ({ page }) => {
    await start(page);
    const p = player(page);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(p.getByRole('button', { name: /Change role/ })).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await expect(p.locator('header').getByText('Song 2 of 6')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(player(page)).toBeHidden();
  });
});

const member = { email: process.env.E2E_MEMBER_EMAIL, password: process.env.E2E_MEMBER_PASSWORD };

test.describe('set player on a seeded stack', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'chromium', 'Desktop Chromium only');
    test.skip(
      !member.email || !member.password,
      'Set E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD to run against a seeded stack',
    );
  });

  test('play, move on, reload in place, exit', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`/login?next=${encodeURIComponent(SEEDED_LIST)}`);
    await page.getByLabel('Email').fill(member.email!);
    await page.getByLabel('Password').fill(member.password!);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((url) => url.pathname === SEEDED_LIST);

    await start(page);
    await expect(
      player(page)
        .locator('header')
        .getByText(/Song 1 of \d+/),
    ).toBeVisible();
    // The Next button (the pedal would scroll a long song first).
    await player(page).getByRole('button', { name: /^Next/ }).click();
    await expect(
      player(page)
        .locator('header')
        .getByText(/Song 2 of \d+/),
    ).toBeVisible();
    await expect(page).toHaveURL(/\?play=2$/);

    await page.reload();
    await expect(
      player(page)
        .locator('header')
        .getByText(/Song 2 of \d+/),
    ).toBeVisible();

    await expect(player(page).getByRole('button', { name: /Change role/ })).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(player(page)).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${SEEDED_LIST}$`));
  });
});
