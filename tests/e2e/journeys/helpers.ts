import { existsSync } from 'node:fs';

import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// H-05 · Shared steps for the end-to-end journeys (tests/e2e/journeys/*.spec.ts).
//
// Every journey runs against a real, seeded stack and creates rows, so it only runs when test
// accounts are supplied (never on a shared preview by default), on desktop Chromium only:
//   E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD           - an approved member
//   E2E_CONTRIBUTOR_EMAIL / E2E_CONTRIBUTOR_PASSWORD - an approved contributor (song journey)
// e.g. against `pnpm dev` on a local stack after `pnpm db:reset && pnpm db:migrate &&
// pnpm db:seed`: seeded users are `<role>.<branch>@example.com` with DEV_PASSWORD from
// db/seed/data.ts (member.sv@example.com, contributor.or@example.com, ...).
//
// Each journey deletes what it creates (lists through the UI; songs and placeholder Storage
// files, which have no delete UI for these roles, through the local service role), in `finally`
// so a failing step still cleans up.

export interface Account {
  email: string | undefined;
  password: string | undefined;
}

export const member: Account = {
  email: process.env.E2E_MEMBER_EMAIL,
  password: process.env.E2E_MEMBER_PASSWORD,
};
export const contributor: Account = {
  email: process.env.E2E_CONTRIBUTOR_EMAIL,
  password: process.env.E2E_CONTRIBUTOR_PASSWORD,
};

/** Skips the journey unless it can run: desktop Chromium and the account's credentials. */
export function requireAccount(info: TestInfo, account: Account) {
  const vars =
    account === contributor
      ? 'E2E_CONTRIBUTOR_EMAIL / E2E_CONTRIBUTOR_PASSWORD'
      : 'E2E_MEMBER_EMAIL / E2E_MEMBER_PASSWORD';
  test.skip(info.project.name !== 'chromium', 'Creates real rows; desktop Chromium only');
  test.skip(!account.email || !account.password, `Set ${vars} to run against a seeded stack`);
}

/** A name unique to this run, so reruns on the same database don't collide. */
export const uniqueName = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

/** Clicks `trigger` until `target` shows: a click that lands before hydration does nothing. */
export async function openWith(trigger: Locator, target: Locator) {
  await expect(async () => {
    if (!(await target.isVisible())) await trigger.click();
    await expect(target).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** Password sign-in (the local stand-in for SSO, which needs a real identity provider). */
export async function signIn(page: Page, account: Account, next = '/library') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  // Before hydration a submit is a native GET that would put the password in the URL.
  await page.waitForFunction(() => {
    const form = document.querySelector('main form');
    return !!form && Object.keys(form).some((k) => k.startsWith('__reactProps'));
  });
  await page.getByLabel('Email').fill(account.email!);
  await page.getByLabel('Password').fill(account.password!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL((url) => url.pathname === next, { timeout: 30_000 });
}

export const desktopNav = (page: Page) => page.getByTestId('nav-desktop');

/** A song's row in library results or a list (SongRow is a group named by the title). */
export const songRow = (scope: Page | Locator, title: string) =>
  scope.getByRole('group', { name: title, exact: true });

/**
 * Creates a list from the nav ("Create event setlist" / "Create listening playlist"). It becomes
 * the current list and the app lands on the library.
 */
export async function createList(page: Page, type: 'setlist' | 'playlist', name: string) {
  const label = type === 'setlist' ? 'Create event setlist' : 'Create listening playlist';
  if (new URL(page.url()).pathname !== '/library') await page.goto('/library');
  const dialog = page.getByRole('dialog', { name: label });
  await openWith(desktopNav(page).getByRole('button', { name: label }), dialog);
  await dialog.getByLabel('Name').fill(name);
  await dialog
    .getByRole('button', { name: type === 'setlist' ? 'Create setlist' : 'Create playlist' })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/library$/);
  await expect(desktopNav(page).getByRole('button', { name: `Share “${name}”` })).toBeEnabled();
}

/** Adds a song to the current list from the library's ADD button (REQ-LIST-02). */
export async function addToCurrentList(
  page: Page,
  type: 'setlist' | 'playlist',
  listName: string,
  title: string,
) {
  const prefix = type === 'setlist' ? 'Event' : 'Listen';
  await page.goto(`/library?q=${encodeURIComponent(title)}`);
  const current = page.getByRole('menuitem', { name: `${prefix}: ${listName}` });
  await openWith(page.getByRole('button', { name: `Add “${title}” to a list` }).first(), current);
  await current.click();
  await expect(page.getByText(`Added to ${prefix}: ${listName}`).first()).toBeVisible();
  // Adding returns to the results with the search intact (REQ-LIST-02).
  expect(new URL(page.url()).searchParams.get('q')).toBe(title);
}

/** Opens one of my lists from Open Setlist / Open Playlist; returns its path. */
export async function openMyList(page: Page, type: 'setlist' | 'playlist', name: string) {
  await page.goto(`/lists?type=${type}&scope=mine`);
  await page.getByRole('link', { name }).first().click();
  await page.waitForURL(/\/lists\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname;
}

/**
 * Deletes one of my lists by name from its page, if it exists. Used in `finally`, so it also
 * runs when the journey failed before or after opening the list.
 */
export async function deleteMyList(page: Page, type: 'setlist' | 'playlist', name: string) {
  await page.goto(`/lists?type=${type}&scope=mine`);
  const link = page.getByRole('link', { name }).first();
  if ((await link.count()) === 0) return;
  await link.click();
  await page.waitForURL(/\/lists\/[0-9a-f-]+$/);
  const confirm = page.getByRole('button', {
    name: type === 'setlist' ? 'Delete setlist' : 'Delete playlist',
  });
  await openWith(page.getByRole('button', { name: 'Delete', exact: true }), confirm);
  await confirm.click();
  await page.waitForURL((url) => url.pathname === '/lists');
}

// ----- Local service role (placeholder files, song clean-up) ------------------------------

/**
 * A service-role client for the **local** Supabase stack only, or null anywhere else (a hosted
 * project is never written to with the service role from a test).
 */
export function localServiceClient(): SupabaseClient | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Makes sure a seeded resource's Storage object exists on the local stack (the seed creates
 * resource rows but no files). Returns a clean-up that removes the object again if this call
 * uploaded it, and does nothing otherwise.
 */
export async function ensureLocalFile(
  storagePath: string,
  body: Uint8Array,
  contentType: string,
): Promise<() => Promise<void>> {
  const supabase = localServiceClient();
  if (!supabase) return async () => {};
  const bucket = supabase.storage.from('resources');
  const slash = storagePath.lastIndexOf('/');
  const { data: existing } = await bucket.list(storagePath.slice(0, slash), {
    search: storagePath.slice(slash + 1),
  });
  if (existing?.some((o) => o.name === storagePath.slice(slash + 1))) return async () => {};
  const { error } = await bucket.upload(storagePath, body, { contentType, upsert: true });
  if (error) throw error;
  return async () => {
    await bucket.remove([storagePath]);
  };
}

/**
 * Overrides a setlist row's key for the event (LIST-07's override editor) and waits until the
 * server has saved it.
 */
export async function overrideKey(page: Page, title: string, key: string) {
  const item = page.getByRole('menuitem', { name: 'Change key, BPM or energy' });
  await openWith(page.getByRole('button', { name: `Actions for ${title}` }), item);
  await item.click();
  const editor = page.getByTestId('item-override-editor');
  await editor.getByLabel('Key', { exact: true }).selectOption(key);
  await expect(page.getByText(`Updated “${title}” for this setlist`).first()).toBeVisible({
    timeout: 15_000,
  });
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
}
