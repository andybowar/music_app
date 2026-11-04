import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

// ADM-08 · Report a bug from the account menu (REQ-ADM-03).
//
// Two groups:
//  1. `/dev/bug-report` gallery: axe and the 360px layout. Runs locally and on every Vercel
//     preview; skips itself wherever the gallery 404s (production).
//  2. A seeded member reports a bug with one PNG from the account menu and finds it under
//     /bugs; a seeded admin sees it on /admin, changes its status and deletes it. Creates (then
//     deletes) rows, so it only runs with test accounts:
//       E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD - an approved member
//       E2E_ADMIN_EMAIL  / E2E_ADMIN_PASSWORD  - an approved admin
//     e.g. against `pnpm dev` on a local stack after `pnpm db:reset && pnpm db:migrate &&
//     pnpm db:seed` (seeded users sign in with DEV_PASSWORD from db/seed/data.ts:
//     member.sv@example.com is a member, jordan.ellis@example.com an admin).

const GALLERY = '/dev/bug-report';

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

test.describe('bug report gallery', () => {
  test.beforeEach(async ({ page, request }) => {
    const res = await request.get(GALLERY);
    test.skip(res.status() === 404, `${GALLERY} is not served here (404 in production)`);
    expect(res.ok()).toBe(true);
    await page.goto(GALLERY);
    await expect(page.getByRole('heading', { name: 'Report detail · as an admin' })).toBeVisible();
  });

  test('has no serious axe violations', async ({ page }, info) => {
    await expectNoSeriousViolations(page, info);
  });

  test('fits 360px without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await expectNoHorizontalScroll(page);
  });
});

// ---------------------------------------------------------------------------------------------
// 2. Seeded member and admin
// ---------------------------------------------------------------------------------------------

const member = { email: process.env.E2E_MEMBER_EMAIL, password: process.env.E2E_MEMBER_PASSWORD };
const admin = { email: process.env.E2E_ADMIN_EMAIL, password: process.env.E2E_ADMIN_PASSWORD };

async function signIn(page: Page, email: string, password: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next);
}

test.describe('bug reports on a seeded stack', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'chromium', 'Creates real rows; desktop Chromium only');
    test.skip(
      !member.email || !member.password || !admin.email || !admin.password,
      'Set E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD and E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD',
    );
  });

  test('a member reports a bug with a screenshot; an admin triages it', async ({
    browser,
  }, info) => {
    test.setTimeout(180_000);
    const title = `E2E bug ${Date.now()}`;

    // Member: account menu → Report a bug → submit with one PNG → see it under /bugs.
    const memberContext = await browser.newContext();
    const page = await memberContext.newPage();
    await signIn(page, member.email!, member.password!, '/library');
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('menuitem', { name: 'Report a bug' }).click();
    await page.waitForURL((url) => url.pathname === '/bugs/new');
    expect(new URL(page.url()).searchParams.get('from')).toBe('/library');
    const sent = page.getByRole('region', { name: 'Sent with your report' });
    await expect(sent).toContainText('/library');
    await expect(sent).not.toContainText('Detecting');
    await expectNoSeriousViolations(page, info);

    await page.getByLabel('What went wrong?').fill(title);
    await page.getByLabel('What happened?').fill('I clicked a song and nothing happened.');
    await page
      .getByTestId('screenshot-input')
      .setInputFiles([{ name: 'screen.png', mimeType: 'image/png', buffer: PNG }]);
    await expect(page.getByText('1 of 5 screenshots')).toBeVisible();
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByText('Thanks — we got it')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('link', { name: 'View your report' }).click();
    await page.waitForURL(/\/bugs\/[0-9a-f-]{36}$/);
    const reportPath = new URL(page.url()).pathname;
    const reportId = reportPath.split('/').pop()!;
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    const thumb = page.getByRole('button', { name: 'Open screen.png full size' });
    await expect
      .poll(() => thumb.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expectNoSeriousViolations(page, info);

    await page.goto('/bugs');
    await expect(page.getByRole('link', { name: new RegExp(title) })).toContainText('New');
    await expectNoSeriousViolations(page, info);

    // Admin: sees it on /admin, sets the status, leaves a note, deletes it.
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await signIn(adminPage, admin.email!, admin.password!, '/admin');
    const section = adminPage.getByRole('region', { name: /Bug reports/ });
    await expect(section.getByRole('link', { name: new RegExp(title) })).toBeVisible();
    await section.getByRole('link', { name: new RegExp(title) }).click();
    await adminPage.waitForURL((url) => url.pathname === `/admin/bugs/${reportId}`);
    await expectNoSeriousViolations(adminPage, info);

    await Promise.all([
      adminPage.waitForResponse((r) => r.request().method() === 'POST'),
      adminPage.getByLabel('Status').selectOption('confirmed'),
    ]);
    await adminPage.getByLabel('Note to the reporter').fill('Thanks, we can see it.');
    await Promise.all([
      adminPage.waitForResponse((r) => r.request().method() === 'POST'),
      adminPage.getByRole('button', { name: 'Save note' }).click(),
    ]);

    // The member sees the new status and the note.
    await page.goto(reportPath);
    await expect(page.getByText('Confirmed')).toBeVisible();
    await expect(page.getByText('Thanks, we can see it.')).toBeVisible();

    await adminPage.goto('/admin/bugs');
    await expectNoSeriousViolations(adminPage, info);
    await adminPage.goto(`/admin/bugs/${reportId}`);
    await adminPage.getByRole('button', { name: 'Delete' }).click();
    await adminPage.getByRole('button', { name: 'Delete report' }).click();
    await adminPage.waitForURL((url) => url.pathname === '/admin/bugs');
    await expect(adminPage.getByRole('link', { name: new RegExp(title) })).toHaveCount(0);

    await memberContext.close();
    await adminContext.close();
  });

  test("a member gets a 403 on /admin/bugs and a 404 for someone else's report", async ({
    page,
  }) => {
    await signIn(page, member.email!, member.password!, '/bugs');
    await page.goto('/admin/bugs');
    await expect(page.getByText('403')).toBeVisible();
    await page.goto('/bugs/00000000-0000-4000-8000-000000000000');
    await expect(page.getByText(/could not be found|404/i).first()).toBeVisible();
  });
});
