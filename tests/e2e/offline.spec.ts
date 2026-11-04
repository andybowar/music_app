import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { buildSamplePdf } from '../../components/media/sampleMedia';
import songsJson from '../../fixtures/songs.json' with { type: 'json' };

// H-01 · PWA + offline setlists (REQ-NF-02). CR H-01-pwa-public-paths-and-e2e.
//
// Sign in, open a setlist, open its chord chart PDF, go offline, reload: the setlist renders
// from the service worker's saved copy with the offline banner, and the chord chart opens from
// cache. A page that was never opened shows the offline fallback instead.
//
// Skips itself unless both hold:
//  - **A production build.** The worker (`app/sw.ts`) is built by `@serwist/next` on `next build`
//    and disabled under `next dev`. Detection: `/sw.js` must be served, and the page must not
//    carry Next's dev build id (`"b":"development"` in the RSC payload). The second check catches
//    `next dev` serving a stale `public/sw.js` left behind by an earlier local build. So it runs
//    against `pnpm build && pnpm start` and against Vercel previews.
//  - **A test account:** E2E_CONTRIBUTOR_EMAIL / E2E_CONTRIBUTOR_PASSWORD, an approved
//    contributor (seeded: `contributor.or@example.com` with DEV_PASSWORD from db/seed/data.ts).
//
// Data: the seed creates resource rows but no Storage files, so the spec makes its own through
// the UI. It uploads a generated placeholder chord chart to the primary key of a seeded song that
// has no files, creates a setlist holding that song, and deletes both afterwards, also when the
// test fails.

/** "Be Exalted, O God": one key (Eb), no files in the fixtures. */
const SONG = songsJson.find((s) => s.title === 'Be Exalted, O God')!;
const SONG_KEY = 'Key of Eb (primary)';

const contributor = {
  email: process.env.E2E_CONTRIBUTOR_EMAIL,
  password: process.env.E2E_CONTRIBUTOR_PASSWORD,
};

const startsWith = (name: string) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
const tab = (page: Page, name: string) => page.getByRole('tab', { name: startsWith(name) });
const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name: startsWith(name) });

async function isProductionBuild(request: APIRequestContext): Promise<boolean> {
  const sw = await request.get('/sw.js');
  if (!sw.ok()) return false;
  const html = await (await request.get('/login')).text();
  return !/\\?"b\\?":\\?"development\\?"/.test(html);
}

async function signIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  // Before hydration a submit is a native GET that would put the password in the URL.
  await page.waitForFunction(() => {
    const form = document.querySelector('main form');
    return !!form && Object.keys(form).some((k) => k.startsWith('__reactProps'));
  });
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next);
}

/** Clicks `trigger` until `target` shows: a click that lands before hydration does nothing. */
async function openWith(trigger: ReturnType<Page['locator']>, target: ReturnType<Page['locator']>) {
  await expect(async () => {
    if (!(await target.isVisible())) await trigger.click();
    await expect(target).toBeVisible({ timeout: 2_000 });
  }).toPass();
}

/** Uploads a placeholder chord chart to the song's primary key; returns the resource label. */
async function uploadChordChart(page: Page): Promise<string> {
  await page.goto(`/songs/${SONG.id}/edit`);
  const filesTab = tab(page, 'Files & links');
  await openWith(filesTab, panel(page, 'Files & links'));
  const key = panel(page, 'Files & links').getByRole('region', { name: SONG_KEY });
  await key.getByLabel(`Upload Chord chart to ${SONG_KEY}`).setInputFiles({
    name: 'e2e-offline-chord-chart.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(buildSamplePdf(2), 'latin1'),
  });
  const open = key.getByRole('button', { name: /^Open Chord chart/ });
  await expect(open).toBeVisible({ timeout: 30_000 });
  return ((await open.getAttribute('aria-label')) ?? '').replace(/^Open /, '');
}

async function deleteChordChart(page: Page, label: string) {
  await page.goto(`/songs/${SONG.id}/edit`);
  await openWith(tab(page, 'Files & links'), panel(page, 'Files & links'));
  const key = panel(page, 'Files & links').getByRole('region', { name: SONG_KEY });
  await key.getByRole('button', { name: `Delete ${label}` }).click();
  await key.getByRole('button', { name: `Remove ${label}` }).click();
  // The row (shown as "<label> (Chord chart · PDF)") goes once the delete has finished.
  await expect(key.getByRole('listitem').filter({ hasText: '(Chord chart · PDF)' })).toHaveCount(
    0,
    { timeout: 15_000 },
  );
}

/** Creates a setlist from the nav (it becomes the current list) and adds the song to it. */
async function createSetlist(page: Page, name: string): Promise<string> {
  await page.goto('/library');
  const nav = page.getByTestId('nav-desktop');
  const dialog = page.getByRole('dialog', { name: 'Create event setlist' });
  await openWith(nav.getByRole('button', { name: 'Create event setlist' }), dialog);
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Create setlist' }).click();
  await expect(dialog).toBeHidden();

  await page.goto(`/library?q=${encodeURIComponent(SONG.title)}`);
  const current = page.getByRole('menuitem', { name: `Event: ${name}` });
  await openWith(page.getByRole('button', { name: `Add “${SONG.title}” to a list` }), current);
  await current.click();
  await expect(page.getByText(`Added to Event: ${name}`).first()).toBeVisible();

  await page.goto('/lists?type=setlist&scope=mine');
  await page.getByRole('link', { name }).first().click();
  await page.waitForURL(/\/lists\/[0-9a-f-]+$/);
  return new URL(page.url()).pathname;
}

async function deleteSetlist(page: Page, path: string) {
  await page.goto(path);
  const confirm = page.getByRole('button', { name: 'Delete setlist' });
  await openWith(page.getByRole('button', { name: 'Delete', exact: true }), confirm);
  await confirm.click();
  await page.waitForURL((url) => url.pathname === '/lists');
}

/** Waits until the service worker controls the page (it claims clients on activation). */
async function waitForWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 15_000,
    })
    .toBe(true);
}

/** Number of entries in one of the worker's caches (`app/sw.ts` OFFLINE_CACHES). */
const cacheSize = (page: Page, name: string) =>
  page.evaluate(async (n) => (await (await caches.open(n)).keys()).length, name);

/** Opens the song's chord chart from the setlist's Resources panel and waits for it to render. */
async function openChordChart(page: Page, label: string) {
  const row = page.getByRole('group', { name: SONG.title, exact: true });
  const resources = page.getByTestId('resources-panel');
  await openWith(row.getByRole('button', { name: /Resources/ }), resources);
  await resources.getByRole('button', { name: /^Chord chart, .*opens viewer$/ }).click();
  const viewer = page.getByRole('dialog', { name: label });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('status', { name: 'Loading PDF' })).toBeHidden({
    timeout: 15_000,
  });
  await expect(viewer.getByText('Couldn’t open this PDF.')).toHaveCount(0);
  await expect(viewer.getByText('Page 1 of 2')).toBeVisible();
  return viewer;
}

test.describe('offline setlists', () => {
  test.beforeEach(async ({ request }, info) => {
    test.skip(info.project.name !== 'chromium', 'Creates real rows; desktop Chromium only');
    test.skip(
      !contributor.email || !contributor.password,
      'Set E2E_CONTRIBUTOR_EMAIL / E2E_CONTRIBUTOR_PASSWORD to run against a seeded stack',
    );
    test.skip(
      !(await isProductionBuild(request)),
      'The service worker only exists in a production build (next build && next start)',
    );
  });

  test('an opened setlist and its chord chart work offline; other pages show the fallback', async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await signIn(page, contributor.email!, contributor.password!, '/library');

    let label: string | null = null;
    let listPath: string | null = null;
    const name = `E2E offline ${Date.now()}`;
    try {
      label = await uploadChordChart(page);
      listPath = await createSetlist(page, name);

      // Online: a full load of the setlist under the worker saves it; opening the chart caches
      // the PDF body (by resource id) and the signed-URL action reply.
      await waitForWorker(page);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      await expect.poll(() => cacheSize(page, 'offline-pages-v1')).toBeGreaterThan(0);
      let viewer = await openChordChart(page, label);
      await expect.poll(() => cacheSize(page, 'offline-resources-v1')).toBeGreaterThan(0);
      await expect.poll(() => cacheSize(page, 'offline-actions-v1')).toBeGreaterThan(0);
      await viewer.getByRole('button', { name: 'Close' }).click();
      await expect(viewer).toBeHidden();

      // Offline: reload the setlist.
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      await expect(page.locator('#offline-banner')).toContainText(
        'You’re offline. Showing the copy saved',
      );
      viewer = await openChordChart(page, label);
      await viewer.getByRole('button', { name: 'Close' }).click();

      // A page that was never saved: the offline fallback, linking to the saved setlist.
      await page.goto('/branches');
      await expect(
        page.getByRole('heading', { name: 'This page isn’t available offline' }),
      ).toBeVisible();
      await expect(page.getByRole('link', { name })).toHaveAttribute('href', listPath);
    } finally {
      await context.setOffline(false);
      if (listPath) await deleteSetlist(page, listPath);
      if (label) await deleteChordChart(page, label);
    }
  });
});
