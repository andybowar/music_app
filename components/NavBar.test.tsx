import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { LIST_IDS, getList } from '@/fixtures';

import { NAV_HREFS, NAV_OVERFLOW_LINKS, NavBar, UserMenu } from './NavBar';

const pathname = vi.hoisted(() => ({ value: '/songs/abc' as string | null }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }));

const list = getList(LIST_IDS.bg41926);

beforeAll(() => {
  // Radix positioning/scroll-lock touch APIs jsdom lacks.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
});

beforeEach(() => {
  pathname.value = '/songs/abc';
});

afterEach(cleanup);

function setup(currentList = null as typeof list | null) {
  const onCreate = vi.fn();
  const onShare = vi.fn();
  render(<NavBar currentList={currentList} onCreate={onCreate} onShare={onShare} />);
  return {
    onCreate,
    onShare,
    desktop: within(screen.getByTestId('nav-desktop')),
    mobile: within(screen.getByTestId('nav-mobile')),
  };
}

describe('NavBar links', () => {
  it('desktop row has all seven REQ-NAV-01 items', () => {
    const { desktop } = setup();
    expect(desktop.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/library');
    expect(desktop.getByRole('link', { name: 'Search library' })).toHaveAttribute(
      'href',
      NAV_HREFS.search,
    );
    expect(desktop.getByRole('link', { name: 'Open setlist' })).toHaveAttribute(
      'href',
      '/lists?type=setlist',
    );
    expect(desktop.getByRole('link', { name: 'Open playlist' })).toHaveAttribute(
      'href',
      '/lists?type=playlist',
    );
    expect(desktop.getByRole('button', { name: 'Create event setlist' })).toBeInTheDocument();
    expect(desktop.getByRole('button', { name: 'Create listening playlist' })).toBeInTheDocument();
    expect(desktop.getByRole('button', { name: /^Share/ })).toBeInTheDocument();
  });

  it('Home has no query string, so it clears search params (REQ-NAV-03)', () => {
    const { desktop, mobile } = setup();
    for (const nav of [desktop, mobile]) {
      const href = nav.getByRole('link', { name: 'Home' }).getAttribute('href');
      expect(href).toBe('/library');
    }
  });

  it('mobile tab bar has Home, Search, Setlists, Playlists and More', () => {
    const { mobile } = setup();
    expect(mobile.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/library');
    expect(mobile.getByRole('link', { name: 'Search' })).toHaveAttribute('href', NAV_HREFS.search);
    expect(mobile.getByRole('link', { name: 'Setlists' })).toHaveAttribute(
      'href',
      '/lists?type=setlist',
    );
    expect(mobile.getByRole('link', { name: 'Playlists' })).toHaveAttribute(
      'href',
      '/lists?type=playlist',
    );
    expect(mobile.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('marks Home as the current page on /library only', () => {
    pathname.value = '/library';
    const { desktop, mobile } = setup();
    expect(desktop.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(mobile.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    cleanup();
    pathname.value = '/lists';
    const again = setup();
    expect(again.desktop.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('copes with a null pathname (rendered outside the app router)', () => {
    pathname.value = null;
    const { desktop } = setup();
    expect(desktop.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
  });

  it('hides the desktop More menu while there are no overflow links', () => {
    expect(NAV_OVERFLOW_LINKS).toHaveLength(0);
    const { desktop } = setup();
    expect(desktop.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
  });

  it('server-renders without throwing', () => {
    const html = renderToString(
      <NavBar currentList={list} onCreate={() => {}} onShare={() => {}} />,
    );
    expect(html).toContain('Search library');
  });
});

describe('NavBar actions (desktop)', () => {
  it('Create buttons call onCreate with the list type', async () => {
    const user = userEvent.setup();
    const { desktop, onCreate } = setup();
    await user.click(desktop.getByRole('button', { name: 'Create event setlist' }));
    await user.click(desktop.getByRole('button', { name: 'Create listening playlist' }));
    expect(onCreate.mock.calls).toEqual([['setlist'], ['playlist']]);
  });

  it('Share is disabled without a current list (REQ-NAV-04)', async () => {
    const user = userEvent.setup();
    const { desktop, onShare } = setup(null);
    const share = desktop.getByRole('button', { name: /^Share/ });
    expect(share).toBeDisabled();
    expect(share).toHaveAccessibleName('Share (no current list)');
    await user.click(share);
    expect(onShare).not.toHaveBeenCalled();
  });

  it('Share names the current list and calls onShare', async () => {
    const user = userEvent.setup();
    const { desktop, onShare } = setup(list);
    const share = desktop.getByRole('button', { name: `Share “${list.name}”` });
    expect(share).toBeEnabled();
    await user.click(share);
    expect(onShare).toHaveBeenCalledTimes(1);
  });

  it('is keyboard navigable in DOM order and activates with Enter', async () => {
    const user = userEvent.setup();
    const { desktop, onCreate } = setup(list);
    await user.tab();
    expect(desktop.getByRole('link', { name: 'Home' })).toHaveFocus();
    await user.tab();
    expect(desktop.getByRole('link', { name: 'Search library' })).toHaveFocus();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(desktop.getByRole('button', { name: 'Create event setlist' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onCreate).toHaveBeenCalledWith('setlist');
  });

  it('every focusable item has a visible focus style', () => {
    const { desktop, mobile } = setup(list);
    const items = [
      ...desktop.getAllByRole('link'),
      ...desktop.getAllByRole('button'),
      ...mobile.getAllByRole('link'),
      ...mobile.getAllByRole('button'),
    ];
    for (const el of items) expect(el.className).toContain('focus-visible:ring-[3px]');
  });
});

describe('NavBar overflow menu (mobile)', () => {
  it('holds both Create actions and calls onCreate', async () => {
    const user = userEvent.setup();
    const { mobile, onCreate } = setup();
    await user.click(mobile.getByRole('button', { name: 'More' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Create listening playlist' }));
    expect(onCreate).toHaveBeenCalledWith('playlist');
  });

  it('opens from the keyboard and Share is disabled without a current list', async () => {
    const user = userEvent.setup();
    const { mobile, onShare } = setup(null);
    mobile.getByRole('button', { name: 'More' }).focus();
    await user.keyboard('{Enter}');
    const share = await screen.findByRole('menuitem', { name: /Share/ });
    expect(share).toHaveAttribute('aria-disabled', 'true');
    expect(share).toHaveTextContent('No current list');
    await user.click(share);
    expect(onShare).not.toHaveBeenCalled();
  });

  it('Share shows the current list name and calls onShare', async () => {
    const user = userEvent.setup();
    const { mobile, onShare } = setup(list);
    await user.click(mobile.getByRole('button', { name: 'More' }));
    const share = await screen.findByRole('menuitem', { name: /Share/ });
    expect(share).toHaveTextContent(list.name);
    await user.click(share);
    expect(onShare).toHaveBeenCalledTimes(1);
  });
});

describe('UserMenu', () => {
  it('shows name, email and branch, and Sign out submits the action', async () => {
    const user = userEvent.setup();
    const signOut = vi.fn(async () => {});
    const submit = vi
      .spyOn(HTMLFormElement.prototype, 'requestSubmit')
      .mockImplementation(() => undefined);
    render(
      <UserMenu
        name="Jordan Ellis"
        email="jordan@example.com"
        branchName="Servant"
        signOut={signOut}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Account' }));
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveTextContent('Jordan Ellis');
    expect(menu).toHaveTextContent('jordan@example.com');
    expect(menu).toHaveTextContent('Servant');
    await user.click(within(menu).getByRole('menuitem', { name: 'Sign out' }));
    expect(submit).toHaveBeenCalledTimes(1);
    submit.mockRestore();
  });

  it('shows "No branch" when the user has none', async () => {
    const user = userEvent.setup();
    render(
      <UserMenu name="Sam" email="sam@example.com" branchName={null} signOut={async () => {}} />,
    );
    await user.click(screen.getByRole('button', { name: 'Account' }));
    expect(await screen.findByRole('menu')).toHaveTextContent('No branch');
  });
});
