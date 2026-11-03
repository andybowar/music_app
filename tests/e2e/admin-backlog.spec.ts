import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

// ADM-06 · Admin backlog: to-dos and enhancement requests with wireframes (REQ-ADM-01/02).
//
// Three groups:
//  1. `/dev/admin-backlog` gallery: the image dialog's keyboard use and the 360px layout. Runs
//     locally and on every Vercel preview; skips itself wherever the gallery 404s (production).
//  2. A seeded admin on a real stack: add, tick and delete a to-do on /admin; submit a request
//     with two PNG wireframes; see them on its detail page; axe on the new routes. Creates
//     (then deletes) rows, so it only runs with a test account:
//       E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD - an approved admin
//  3. A seeded music leader sees no backlog sections and gets a 403 on /admin/requests:
//       E2E_LEADER_EMAIL / E2E_LEADER_PASSWORD - an approved music leader
//     e.g. against `pnpm dev` on a local stack after `pnpm db:reset && pnpm db:migrate &&
//     pnpm db:seed` (seeded users sign in with DEV_PASSWORD from db/seed/data.ts:
//     jordan.ellis@example.com is an admin, maria.chen@example.com a music leader).

const GALLERY = '/dev/admin-backlog';

// 1×1 PNG, generated: no real screenshots.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

async function expectNoSeriousViolations(page: Page, info: TestInfo) {
  await page.waitForLoadState('networkidle');
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .exclude('nextjs-portal')
    .analyze();
  await info.attach(`axe ${page.url()}`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({ rule: v.id, targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) }));
  expect.soft(blocking, `serious/critical axe violations on ${page.url()}`).toEqual([]);
}

// ---------------------------------------------------------------------------------------------
// 1. Gallery
// ---------------------------------------------------------------------------------------------

test.describe('admin backlog gallery', () => {
  test.beforeEach(async ({ page, request }) => {
    const res = await request.get(GALLERY);
    test.skip(res.status() === 404, `${GALLERY} is not served here (404 in production)`);
    expect(res.ok()).toBe(true);
    await page.goto(GALLERY);
    await expect(page.getByRole('heading', { name: 'Request detail (3 images)' })).toBeVisible();
  });

  test('the image dialog moves with the arrow keys and closes with Escape', async ({ page }) => {
    const thumb = page.getByRole('button', { name: 'Open wireframe-1.png full size' });
    const dialog = page.getByRole('dialog');
    await expect(async () => {
      if (!(await dialog.isVisible())) await thumb.click();
      await expect(dialog).toBeVisible({ timeout: 2_000 });
    }).toPass();
    await expect(dialog).toContainText('Image 1 of 3');
    await page.keyboard.press('ArrowRight');
    await expect(dialog).toContainText('Image 2 of 3');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(dialog).toContainText('Image 3 of 3');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(thumb).toBeFocused();
  });

  test('fits 360px without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await expectNoHorizontalScroll(page);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Seeded admin
// ---------------------------------------------------------------------------------------------

const admin = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };
const leader = { email: process.env.E2E_LEADER_EMAIL, password: process.env.E2E_LEADER_PASSWORD };

/** Resolves when the next server action POST answers (optimistic UI updates before that). */
const actionDone = (page: Page) =>
  page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/admin'));

async function signIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next);
}

test.describe('admin backlog on a seeded stack', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'chromium', 'Creates real rows; desktop Chromium only');
    test.skip(
      !admin.email || !admin.password,
      'Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD to run against a seeded stack',
    );
  });

  test('add, tick off and delete a to-do on /admin', async ({ page }) => {
    await signIn(page, admin.email!, admin.password!, '/admin');
    const title = `E2E to-do ${Date.now()}`;
    const todos = page.getByRole('region', { name: 'To-dos' });
    await todos.getByLabel('New to-do').fill(title);
    await todos.getByLabel('New to-do').press('Enter');
    const box = todos.getByRole('checkbox', { name: title });
    await expect(box).toBeEnabled();

    await Promise.all([actionDone(page), box.click()]);
    await expect(todos.getByText(/^Done \(\d+\)$/)).toBeVisible();
    await page.reload();
    await page
      .getByRole('region', { name: 'To-dos' })
      .getByText(/^Done \(\d+\)$/)
      .click();
    await expect(page.getByRole('checkbox', { name: title })).toBeChecked();

    await Promise.all([
      actionDone(page),
      page.getByRole('button', { name: `Delete “${title}”` }).click(),
    ]);
    await expect(page.getByRole('checkbox', { name: title })).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test('submit a request with two wireframes and see them on its page', async ({ page }, info) => {
    test.setTimeout(120_000);
    await signIn(page, admin.email!, admin.password!, '/admin/requests/new');
    await expectNoSeriousViolations(page, info);

    const title = `E2E request ${Date.now()}`;
    await page.getByLabel('Enhancement').check();
    await page.getByLabel('Title').fill(title);
    await page.getByLabel('Description').fill('First line\nSecond line');
    await page.getByTestId('wireframe-input').setInputFiles([
      { name: 'home.png', mimeType: 'image/png', buffer: PNG },
      { name: 'menu.png', mimeType: 'image/png', buffer: PNG },
    ]);
    await expect(page.getByText('2 of 5 images')).toBeVisible();
    await page.getByRole('button', { name: 'Submit request' }).click();

    await page.waitForURL(/\/admin\/requests\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    for (const name of ['home.png', 'menu.png']) {
      const thumb = page.getByRole('button', { name: `Open ${name} full size` });
      await expect(thumb).toBeVisible();
      // The signed URL actually serves the image.
      await expect
        .poll(() => thumb.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0);
    }
    await page.getByRole('button', { name: 'Open home.png full size' }).click();
    await expect(page.getByRole('img', { name: 'Wireframe: home.png' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expectNoSeriousViolations(page, info);

    await page.goto('/admin/requests');
    await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
    await expectNoSeriousViolations(page, info);

    // Clean up.
    await page.getByRole('link', { name: new RegExp(title) }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete request' }).click();
    await page.waitForURL((url) => url.pathname === '/admin/requests');
    await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);
  });

  test('an unknown request id shows the not-found page', async ({ page }) => {
    // The route streams (loading.tsx), so Next sends notFound() as the 404 page in a 200.
    await signIn(page, admin.email!, admin.password!, '/admin');
    await page.goto('/admin/requests/00000000-0000-4000-8000-000000000000');
    await expect(page.getByText(/could not be found|404/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete' })).toHaveCount(0);
  });
});

// ---------------------------------------------------------------------------------------------
// 3. Seeded music leader
// ---------------------------------------------------------------------------------------------

test.describe('admin backlog as a music leader', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'chromium', 'Desktop Chromium only');
    test.skip(
      !leader.email || !leader.password,
      'Set E2E_LEADER_EMAIL / E2E_LEADER_PASSWORD to run against a seeded stack',
    );
  });

  test('sees only the Themes card and gets a 403 on /admin/requests', async ({ page }) => {
    await signIn(page, leader.email!, leader.password!, '/admin');
    await expect(page.getByRole('link', { name: /Themes/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'To-dos' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Enhancement requests' })).toHaveCount(0);
    await page.goto('/admin/requests');
    await expect(page.getByText('403')).toBeVisible();
  });
});
