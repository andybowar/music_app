import { existsSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { buildSamplePdf } from '../../components/media/sampleMedia';
import songsJson from '../../fixtures/songs.json' with { type: 'json' };

// SRCH-09 · Worship Library (REQ-NAV-02, REQ-SRCH-01, REQ-ROW-02/04). CR SRCH-09-gallery-and-e2e.
//
// Two groups:
//  1. `/dev/library` gallery: LibraryView with fixture results and fake actions. Runs locally and
//     on every Vercel preview, and skips itself wherever the gallery 404s (production).
//  2. The acceptance scenarios against a real, seeded stack. They only run when a test account
//     is supplied:
//       E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD - an approved member
//     e.g. against `pnpm dev` on a local stack after `pnpm db:reset && pnpm db:migrate &&
//     pnpm db:seed` (seeded users sign in with DEV_PASSWORD from db/seed/data.ts). The seed
//     creates resource rows but no files, so against a local Supabase the spec uploads a
//     generated placeholder PDF for the chord chart it opens (never against a hosted project).

const GALLERY = '/dev/library';

/** A song's row in the results (SongRow is a group named by the title). */
const row = (page: Page, title: string) => page.getByRole('group', { name: title, exact: true });

async function openChordChart(page: Page, title: string) {
  // Retry the first click: one that lands before hydration does nothing.
  const resources = row(page, title).getByRole('button', { name: /Resources/ });
  const panel = page.getByRole('dialog', { name: 'Resources' });
  await expect(async () => {
    if (!(await panel.isVisible())) await resources.click();
    await expect(panel).toBeVisible({ timeout: 2_000 });
  }).toPass();
  await panel
    .getByRole('button', { name: /^Chord chart, .*opens viewer$/ })
    .first()
    .click();
  const viewer = page.getByRole('dialog', { name: `${title} · Chord chart` });
  await expect(viewer).toBeVisible();
  // The generated sample PDF renders its first page.
  await expect(viewer.getByRole('status', { name: 'Loading PDF' })).toBeHidden({
    timeout: 15_000,
  });
  await expect(viewer.getByRole('alert')).toHaveCount(0);
  return viewer;
}

// ---------------------------------------------------------------------------------------------
// 1. Gallery
// ---------------------------------------------------------------------------------------------

test.describe('library gallery', () => {
  test.beforeEach(async ({ page, request }) => {
    const res = await request.get(GALLERY);
    test.skip(
      res.status() === 404,
      `${GALLERY} is not served here (404 on the production deployment)`,
    );
    expect(res.ok()).toBe(true);
    await page.goto(GALLERY);
    await expect(row(page, 'A Thousand Hallelujahs')).toBeVisible();
  });

  test('Resources → chord chart opens the PDF viewer', async ({ page }) => {
    const viewer = await openChordChart(page, 'A Thousand Hallelujahs');
    await viewer.getByRole('button', { name: 'Close' }).click();
    await expect(viewer).toBeHidden();
  });

  test('"did you mean" offers the suggestion', async ({ page }) => {
    await page.getByLabel('State').selectOption('did-you-mean');
    await expect(page.getByRole('button', { name: 'redemption' })).toBeVisible();
  });

  test('the search failure shows "Try again"', async ({ page }) => {
    await page.getByLabel('State').selectOption('server-error');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Acceptance scenarios against a real stack
// ---------------------------------------------------------------------------------------------

const member = { email: process.env.E2E_MEMBER_EMAIL, password: process.env.E2E_MEMBER_PASSWORD };

/** "At the Cross" carries the theme "redemption" and one chord chart PDF in the fixtures. */
const SONG = 'At the Cross';

async function signIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next);
}

/** Local Supabase only: put a placeholder PDF where the seeded chord chart row points. */
async function ensureChordChartFile() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) return;

  const song = songsJson.find((s) => s.title === SONG);
  const chart = song?.resources.find((r) => r.kind === 'chord_chart' && r.format === 'pdf');
  if (!chart?.storagePath) return;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const bucket = supabase.storage.from('resources');
  const { error } = await bucket.upload(chart.storagePath, buildSamplePdf(2), {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (error) throw error;
}

async function searchThemes(page: Page, q: string) {
  const search = page.getByRole('search', { name: 'Song search' });
  // Themes only: switch the other fields off.
  for (const field of ['Titles', 'Lyrics', 'Composer']) {
    const toggle = search.getByRole('button', { name: field, exact: true });
    if ((await toggle.getAttribute('aria-pressed')) === 'true') await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  }
  const box = search.getByLabel('Search songs');
  await box.fill(q);
  await box.press('Enter');
  await expect(page).toHaveURL(new RegExp(`[?&]q=${q}(&|$)`));
}

test.describe('worship library on a seeded stack', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'chromium', 'Desktop Chromium only');
    test.skip(
      !member.email || !member.password,
      'Set E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD to run against a seeded stack',
    );
  });

  test('search theme "redemption" → Resources → chord chart PDF opens', async ({ page }) => {
    test.setTimeout(90_000);
    await ensureChordChartFile();
    await signIn(page, member.email!, member.password!, '/library');

    await searchThemes(page, 'redemption');
    await expect(page).toHaveURL(/[?&]fields=themes(&|$)/);
    await expect(row(page, SONG)).toBeVisible();

    const viewer = await openChordChart(page, SONG);
    await viewer.getByRole('button', { name: 'Close' }).click();
    await expect(viewer).toBeHidden();
  });

  test('Back restores the previous search', async ({ page }) => {
    test.setTimeout(90_000);
    await signIn(page, member.email!, member.password!, '/library');

    await searchThemes(page, 'redemption');
    await expect(row(page, SONG)).toBeVisible();
    const redemptionUrl = page.url();

    // A second search, then Back.
    const box = page.getByLabel('Search songs');
    await box.fill('grace');
    await box.press('Enter');
    await expect(page).toHaveURL(/[?&]q=grace(&|$)/);
    await expect(row(page, 'Amazing Grace (My Chains Are Gone)')).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(redemptionUrl);
    await expect(box).toHaveValue('redemption');
    await expect(row(page, SONG)).toBeVisible();

    // Leaving for the song page and coming back keeps the search too.
    await page.goto(`/songs/${songsJson.find((s) => s.title === SONG)!.id}`);
    await expect(page.getByRole('heading', { name: SONG })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(redemptionUrl);
    await expect(page.getByLabel('Search songs')).toHaveValue('redemption');
    await expect(row(page, SONG)).toBeVisible();
  });
});
