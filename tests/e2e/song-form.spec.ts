import { expect, test, type Page } from '@playwright/test';

// LIB-17 · Song create/edit form (REQ-LIB-01). CR LIB-17-gallery-and-e2e.
//
// Two groups:
//  1. `/dev/song-form` gallery: SongForm with fake actions. Runs locally and on every Vercel
//     preview, and skips itself wherever the gallery 404s (the production deployment).
//  2. The acceptance scenarios against a real, seeded stack. They create data, so they only run
//     when test accounts are supplied (never on a shared preview by default):
//       E2E_CONTRIBUTOR_EMAIL / E2E_CONTRIBUTOR_PASSWORD  - an approved contributor
//       E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD            - an approved member
//     e.g. against `pnpm dev` on a local stack after `pnpm db:reset`.

const GALLERY = '/dev/song-form';

// A tab with errors is named e.g. "Basic info (has errors)", so match the start of the name.
const startsWith = (name: string) => new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
const tab = (page: Page, name: string) => page.getByRole('tab', { name: startsWith(name) });
const panel = (page: Page, name: string) => page.getByRole('tabpanel', { name: startsWith(name) });

/** Themes are per lyric section, so the chorus needs text first (placeholder, not real lyrics). */
async function addChorusLyrics(page: Page) {
  await tab(page, 'Lyrics').click();
  await panel(page, 'Lyrics')
    .getByLabel('Chorus', { exact: true })
    .fill('Placeholder chorus line one\nPlaceholder chorus line two');
}

async function addComposer(page: Page, search: string, name: RegExp) {
  const basic = panel(page, 'Basic info');
  await basic.getByRole('button', { name: 'Add composer' }).click();
  await page.getByPlaceholder('Search composers…').fill(search);
  await page.getByRole('option', { name }).first().click();
}

/** The key pickers on the Keys & tempo tab, in order. */
const keyPickers = (page: Page) =>
  panel(page, 'Keys & tempo').getByRole('combobox', { name: 'Key', exact: true });

/** Adds keys in order; the first one added is the primary key. */
async function addKeys(page: Page, keys: readonly string[]) {
  await tab(page, 'Keys & tempo').click();
  const musical = panel(page, 'Keys & tempo');
  for (const [i, key] of keys.entries()) {
    await musical.getByRole('button', { name: i === 0 ? 'Add key' : 'Add alternate key' }).click();
    await keyPickers(page).nth(i).click();
    await page.getByRole('option', { name: key, exact: true }).click();
    await expect(keyPickers(page).nth(i)).toHaveText(key);
  }
}

async function addChorusTheme(page: Page, search: string): Promise<string> {
  await addChorusLyrics(page);
  await tab(page, 'Themes').click();
  await panel(page, 'Themes').getByRole('button', { name: 'Add theme to Chorus' }).click();
  await page.getByPlaceholder('Search themes…').fill(search);
  const option = page.getByRole('option').filter({ hasText: search }).first();
  const name = ((await option.textContent()) ?? search).trim();
  await option.click();
  await expect(panel(page, 'Themes').getByRole('list', { name: 'Chorus themes' })).toContainText(
    search,
  );
  return name;
}

// ---------------------------------------------------------------------------------------------
// 1. Gallery
// ---------------------------------------------------------------------------------------------

test.describe('song form gallery', () => {
  test.beforeEach(async ({ page, request }) => {
    const res = await request.get(GALLERY);
    test.skip(
      res.status() === 404,
      `${GALLERY} is not served here (404 on the production deployment)`,
    );
    expect(res.ok()).toBe(true);
    await page.goto(GALLERY);
    await expect(page.getByRole('heading', { name: 'Add a song' })).toBeVisible();
  });

  test('a new song with three keys and a theme saves and opens its edit page', async ({ page }) => {
    await panel(page, 'Basic info').getByLabel('Title', { exact: true }).fill('1000 Hallelujahs');
    await addComposer(page, 'brooke', /Brooke Ligertwood/);
    await addKeys(page, ['Eb', 'D', 'F']);
    await addChorusTheme(page, 'glory');

    await page.getByRole('button', { name: 'Add song' }).click();
    await expect(page.getByTestId('nav-log')).toContainText(
      /replace\(\/songs\/[0-9a-f-]+\/edit\?created=1\)/,
    );
  });

  test('server field errors show on their tab', async ({ page }) => {
    await page.getByLabel('Save behaviour').selectOption('field-errors');
    await panel(page, 'Basic info').getByLabel('Title', { exact: true }).fill('1000 Hallelujahs');
    await addComposer(page, 'brooke', /Brooke Ligertwood/);
    await addKeys(page, ['Eb']);

    await page.getByRole('button', { name: 'Add song' }).click();
    await expect(tab(page, 'Basic info')).toHaveAttribute('aria-selected', 'true');
    await expect(panel(page, 'Basic info')).toContainText(
      'Simulated: a song with this title already exists',
    );
    await tab(page, 'Keys & tempo').click();
    await expect(panel(page, 'Keys & tempo')).toContainText('Simulated: tempo is out of range');
    await expect(page.getByText('No navigations yet.')).toBeVisible();
  });

  test('the edit form adds a YouTube link to a key', async ({ page }) => {
    await page.getByLabel('State').selectOption('edit');
    await expect(page.getByRole('heading', { name: 'Edit song' })).toBeVisible();
    await tab(page, 'Files & links').click();

    const files = panel(page, 'Files & links');
    const form = files.getByRole('group', { name: /^Add link to Key of / }).first();
    await form.getByLabel('Link URL').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await expect(form.getByText('YouTube video detected')).toBeVisible();
    await form.getByLabel('Label (optional)').fill('Live video');
    await form.getByRole('button', { name: 'Add link' }).click();
    await expect(files.getByRole('button', { name: 'Edit Live video' })).toBeVisible();
  });

  test('members see the 403 state', async ({ page }) => {
    await page.getByLabel('State').selectOption('forbidden');
    await expect(
      page.getByRole('heading', { name: "You don't have access to this page" }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the library' })).toBeVisible();
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Acceptance scenarios against a real stack
// ---------------------------------------------------------------------------------------------

const contributor = {
  email: process.env.E2E_CONTRIBUTOR_EMAIL,
  password: process.env.E2E_CONTRIBUTOR_PASSWORD,
};
const member = { email: process.env.E2E_MEMBER_EMAIL, password: process.env.E2E_MEMBER_PASSWORD };

async function signIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next);
}

/** A tiny valid PDF, generated so no real sheet music is committed. */
function samplePdf(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

test.describe('song form on a seeded stack', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'chromium', 'Creates real rows; desktop Chromium only');
  });

  test('a contributor creates "1000 Hallelujahs" with 3 keys, themes, a PDF and a YouTube link', async ({
    page,
  }) => {
    test.skip(
      !contributor.email || !contributor.password,
      'Set E2E_CONTRIBUTOR_EMAIL / E2E_CONTRIBUTOR_PASSWORD to run against a seeded stack',
    );
    test.setTimeout(120_000);
    await signIn(page, contributor.email!, contributor.password!, '/songs/new');
    await expect(page.getByRole('heading', { name: 'Add a song' })).toBeVisible();

    // Unique per run so reruns on the same database don't collide.
    const title = `1000 Hallelujahs ${Date.now().toString(36)}`;
    await panel(page, 'Basic info').getByLabel('Title', { exact: true }).fill(title);
    await addComposer(page, 'brooke', /Brooke Ligertwood/);
    await addKeys(page, ['Eb', 'D', 'F']);
    const theme = await addChorusTheme(page, 'glory');

    await page.getByRole('button', { name: 'Add song' }).click();
    await page.waitForURL(/\/songs\/[0-9a-f-]+\/edit\?created=1/);
    await expect(page.getByText('Song added.')).toBeVisible();
    await expect(tab(page, 'Files & links')).toHaveAttribute('aria-selected', 'true');

    const files = panel(page, 'Files & links');
    const primary = files.getByRole('region', { name: 'Key of Eb (primary)' });
    await primary.getByLabel('Upload Chord chart to Key of Eb (primary)').setInputFiles({
      name: 'chord-chart.pdf',
      mimeType: 'application/pdf',
      buffer: samplePdf(),
    });
    await expect(primary.getByRole('button', { name: /^Open Chord chart/ })).toBeVisible({
      timeout: 30_000,
    });

    const link = primary.getByRole('group', { name: 'Add link to Key of Eb (primary)' });
    await link.getByLabel('Link URL').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    await link.getByLabel('Label (optional)').fill('Live video');
    await link.getByRole('button', { name: 'Add link' }).click();
    await expect(primary.getByRole('button', { name: 'Edit Live video' })).toBeVisible();

    // Everything is still there after a reload.
    await page.reload();
    await expect(panel(page, 'Basic info').getByLabel('Title', { exact: true })).toHaveValue(title);
    await expect(panel(page, 'Basic info')).toContainText('Brooke Ligertwood');
    await tab(page, 'Keys & tempo').click();
    // Saved keys come back in their saved order (primary first).
    await expect(keyPickers(page)).toHaveText(['Eb', 'D', 'F']);
    await tab(page, 'Themes').click();
    await expect(panel(page, 'Themes').getByRole('list', { name: 'Chorus themes' })).toContainText(
      theme,
    );
    await tab(page, 'Files & links').click();
    const reloaded = panel(page, 'Files & links').getByRole('region', {
      name: 'Key of Eb (primary)',
    });
    await expect(reloaded.getByRole('button', { name: /^Open Chord chart/ })).toBeVisible();
    await expect(reloaded.getByRole('button', { name: 'Edit Live video' })).toBeVisible();
  });

  test('a member visiting /songs/new gets the 403 page', async ({ page }) => {
    test.skip(
      !member.email || !member.password,
      'Set E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD to run against a seeded stack',
    );
    await signIn(page, member.email!, member.password!, '/songs/new');
    await expect(
      page.getByRole('heading', { name: "You don't have access to this page" }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Add a song' })).toHaveCount(0);
  });
});
