import { join } from 'node:path';

import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  test,
  type Browser,
  type Cookie,
  type Page,
  type TestInfo,
} from '@playwright/test';

import { discoverRoutes } from '../../app/dev/pages';

// H-04 · axe scans of every route (REQ-NF-03: WCAG 2.1 AA). Each scan fails on any serious or
// critical violation; the full axe result is attached to the test for the minor/moderate ones.
// Both Playwright projects run every scan, so each page is checked on desktop and at 360px.
//
// Three groups:
//  1. Signed-out pages (login, signup, reset, share with an unknown token). Always run.
//  2. `/dev/*` galleries, which render components in many states without a session. They skip
//     wherever the gallery 404s (the production deployment).
//  3. Signed-in pages. They only read data, but need test accounts, so they skip unless set:
//       E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD   - an approved member who owns a playlist
//       E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD     - an approved admin (admin pages, song form)
//       E2E_PENDING_EMAIL / E2E_PENDING_PASSWORD - a pending account (/account-status)
//       E2E_SHARE_TOKEN                          - a live share token (/share/[token])
//     e.g. against `pnpm build && pnpm start` on a local stack after
//     `pnpm db:reset && pnpm db:migrate && pnpm db:seed` (seeded users sign in with DEV_PASSWORD
//     from db/seed/data.ts: lee.novak@example.com is a member, jordan.ellis@example.com an admin).

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING = new Set(['serious', 'critical']);

/**
 * Violations in files outside H-04's paths, waiting on a change request. Each entry skips one
 * rule for nodes whose HTML contains `html` on `path`; remove it when the CR lands.
 */
const KNOWN: { path: string; rule: string; html: string; cr: string }[] = [
  {
    // The gallery's branch-code trigger is labelled "Branch usage" but shows the code ("SV").
    path: '/dev/panels',
    rule: 'label-content-name-mismatch',
    html: 'aria-label="Branch usage"',
    cr: 'agent-spec/change-requests/H-04-panels-gallery-label.md',
  },
];

function isKnown(path: string, rule: string, html: string): boolean {
  return KNOWN.some((k) => k.path === path && k.rule === rule && html.includes(k.html));
}

async function expectNoSeriousViolations(page: Page, info: TestInfo, label = page.url()) {
  // Let client components hydrate and fonts settle so color contrast reads the final styles.
  await page.waitForLoadState('networkidle');
  // Finish enter animations (menus and dialogs fade in), or axe measures half-faded text.
  // Endless ones (spinners, skeleton pulses) never finish, so they are left alone.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const builder = new AxeBuilder({ page })
    .withTags(WCAG_TAGS)
    // The Next.js dev overlay (only under `next dev`) is not part of the app.
    .exclude('nextjs-portal');
  // An open Radix menu is modal: it aria-hides the rest of the page and traps focus inside the
  // menu, so the hidden links can't be reached. axe accepts that for an open modal dialog but
  // doesn't recognise a modal menu, so it would report every link behind it.
  if ((await page.locator('[role="menu"][data-state="open"]').count()) > 0) {
    builder.disableRules(['aria-hidden-focus']);
  }
  const results = await builder.analyze();
  await info.attach(`axe ${label}`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: 'application/json',
  });
  const path = new URL(page.url()).pathname;
  const blocking = results.violations
    .filter((v) => BLOCKING.has(v.impact ?? ''))
    .map((v) => ({ ...v, nodes: v.nodes.filter((n) => !isKnown(path, v.id, n.html)) }))
    .filter((v) => v.nodes.length > 0)
    .map((v) => ({
      rule: v.id,
      impact: v.impact,
      help: v.help,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
  // Soft, so one test reports every page it scans.
  expect.soft(blocking, `serious/critical axe violations on ${label}`).toEqual([]);
}

async function scan(page: Page, info: TestInfo, path: string) {
  const res = await page.goto(path);
  expect(res?.status(), `${path} status`).toBeLessThan(500);
  await expectNoSeriousViolations(page, info, path);
}

// ── 1. Signed-out pages ──────────────────────────────────────────────────────────────────────

const shareToken = process.env.E2E_SHARE_TOKEN;
const PUBLIC_PAGES = [
  '/login',
  '/signup',
  '/reset',
  '/reset/confirm',
  // An unknown token renders the "link not available" state.
  '/share/not-a-real-share-token',
  ...(shareToken ? [`/share/${shareToken}`] : []),
];

test.describe('signed-out pages', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} has no serious axe violations`, async ({ page }, info) => {
      await scan(page, info, path);
    });
  }
});

// ── 2. Component galleries ───────────────────────────────────────────────────────────────────

const GALLERIES = discoverRoutes(join(process.cwd(), 'app'))
  .map((r) => r.path)
  .filter((p) => p === '/dev' || p.startsWith('/dev/'));

test.describe('component galleries', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get('/dev');
    test.skip(res.status() === 404, '/dev is not served here (404 on the production deployment)');
  });

  for (const path of GALLERIES) {
    test(`${path} has no serious axe violations`, async ({ page }, info) => {
      await scan(page, info, path);
    });
  }
});

// ── 3. Signed-in pages ───────────────────────────────────────────────────────────────────────

interface Account {
  email: string | undefined;
  password: string | undefined;
}

const member: Account = {
  email: process.env.E2E_MEMBER_EMAIL,
  password: process.env.E2E_MEMBER_PASSWORD,
};
const admin: Account = {
  email: process.env.E2E_ADMIN_EMAIL,
  password: process.env.E2E_ADMIN_PASSWORD,
};
const pending: Account = {
  email: process.env.E2E_PENDING_EMAIL,
  password: process.env.E2E_PENDING_PASSWORD,
};

/** Signs in once in a throwaway context and returns the session cookies. */
async function signIn(browser: Browser, account: Account, landing: RegExp): Promise<Cookie[]> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email!);
  await page.getByLabel('Password').fill(account.password!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(landing);
  const cookies = await context.cookies();
  await context.close();
  return cookies;
}

/** The first link on `path` whose href matches, e.g. a song or list detail page. */
async function firstHref(page: Page, path: string, href: RegExp): Promise<string | null> {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  const hrefs = await page
    .locator('main a[href]')
    .evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
  return hrefs.find((h) => href.test(h)) ?? null;
}

/** A song page, from the first library row (rows carry `data-song-id`). */
async function firstSong(page: Page): Promise<string | null> {
  await page.goto('/library');
  const id = await page.locator('[data-song-id]').first().getAttribute('data-song-id');
  return id ? `/songs/${id}` : null;
}

const LIST_HREF = /^\/lists\/[0-9a-f-]{36}$/;

function describeSignedIn(
  name: string,
  account: Account,
  landing: RegExp,
  pages: (page: Page) => Promise<string[]>,
  extra?: (page: Page, info: TestInfo) => Promise<void>,
) {
  test.describe(name, () => {
    let cookies: Cookie[] = [];

    test.beforeAll(async ({ browser }) => {
      if (!account.email || !account.password) return;
      cookies = await signIn(browser, account, landing);
    });

    test.beforeEach(async ({ page }) => {
      test.skip(
        !account.email || !account.password,
        `Set the ${name} E2E_* credentials to run against a seeded stack`,
      );
      await page.context().addCookies(cookies);
    });

    test('pages have no serious axe violations', async ({ page }, info) => {
      test.setTimeout(180_000);
      for (const path of await pages(page)) {
        await test.step(path, () => scan(page, info, path));
      }
    });

    if (extra) {
      test('open dialogs and menus have no serious axe violations', async ({ page }, info) => {
        test.setTimeout(90_000);
        await extra(page, info);
      });
    }
  });
}

describeSignedIn(
  'member',
  member,
  /\/library/,
  async (page) => {
    const song = await firstSong(page);
    const setlist = await firstHref(page, '/lists?type=setlist&scope=all', LIST_HREF);
    const playlist = await firstHref(page, '/lists?type=playlist', LIST_HREF);
    expect(song, 'a song in the library').not.toBeNull();
    expect(setlist, 'a setlist on /lists').not.toBeNull();
    expect(playlist, 'a playlist owned by the member').not.toBeNull();
    return [
      '/library',
      '/library?q=grace',
      song!,
      '/lists?type=setlist',
      '/lists?type=setlist&scope=all',
      '/lists?type=playlist',
      setlist!,
      playlist!,
      '/branches',
      '/quick',
    ];
  },
  async (page, info) => {
    // The nav's create dialog and the row's add-to-list menu render in portals.
    await page.goto('/library');
    await page.waitForLoadState('networkidle');
    // On phones the nav's create actions sit behind a menu, so open the dialog from wherever
    // its button is visible.
    const create = page
      .getByRole('button', { name: 'Create event setlist' })
      .filter({ visible: true })
      .first();
    if ((await create.count()) > 0) {
      await expect(async () => {
        await create.click();
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 2_000 });
      }).toPass();
      await expectNoSeriousViolations(page, info, '/library create setlist dialog');
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();
    }

    const add = page.getByRole('button', { name: /^Add “.+” to a list$/ }).first();
    const menu = page.getByRole('menu');
    await expect(async () => {
      if (!(await menu.isVisible())) await add.click();
      await expect(menu).toBeVisible({ timeout: 2_000 });
    }).toPass();
    // The menu is modal: Tab keeps focus inside it (why aria-hidden-focus is skipped above).
    await page.keyboard.press('Tab');
    expect(await menu.evaluate((m) => m.contains(document.activeElement))).toBe(true);
    await expectNoSeriousViolations(page, info, '/library add-to-list menu');
  },
);

describeSignedIn('admin', admin, /\/library/, async (page) => {
  const song = await firstSong(page);
  expect(song, 'a song in the library').not.toBeNull();
  return [
    '/songs/new',
    `${song!}/edit`,
    '/admin',
    '/admin/users',
    '/admin/branches',
    '/admin/themes',
  ];
});

describeSignedIn('pending account', pending, /\/account-status/, async () => ['/account-status']);
