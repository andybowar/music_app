'use client';

import {
  CalendarPlus,
  CircleUser,
  Ellipsis,
  Headphones,
  House,
  ListMusic,
  ListPlus,
  LogOut,
  Search,
  Share2,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/components/ui/utils';
import type { List, ListType } from '@/types/domain';

/**
 * Omnipresent navigation (REQ-NAV-01) for every signed-in page.
 *
 * - ≥1280px (`xl`): one row of all seven items in the header.
 * - <1280px: a fixed bottom tab bar (Home, Search, Setlists, Playlists, More). "More" is the
 *   overflow menu holding the two create actions and Share.
 *
 * Breakpoints are CSS-only (both variants render; one is `display:none`), so the server and
 * client render the same markup.
 */

export interface NavBarProps {
  /** The session's current list (REQ-NAV-04). Share is disabled while this is null. */
  currentList: List | null;
  /** "Create event setlist" → `'setlist'`, "Create listening playlist" → `'playlist'`. */
  onCreate(type: ListType): void;
  /** Share the current list. Only called when `currentList` is set. */
  onShare(): void;
}

/** Link targets. Home carries no params, which clears any search (REQ-NAV-03). */
export const NAV_HREFS = {
  home: '/library',
  /** Same page as Home; the fragment lets the library page scroll/focus its search input. */
  search: '/library#search',
  openSetlist: '/lists?type=setlist',
  openPlaylist: '/lists?type=playlist',
} as const;

export interface NavOverflowLink {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Extra destinations shown in the overflow ("More") menu on every screen size.
 * Later tasks append here (BR-02 "Other branches", BR-04 quick theme lookup).
 */
export const NAV_OVERFLOW_LINKS: readonly NavOverflowLink[] = [];

const CREATE_ITEMS: ReadonlyArray<{ type: ListType; label: string; icon: LucideIcon }> = [
  { type: 'setlist', label: 'Create event setlist', icon: CalendarPlus },
  { type: 'playlist', label: 'Create listening playlist', icon: ListPlus },
];

const focusRing =
  'outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

function shareTitle(currentList: List | null): string {
  return currentList ? `Share “${currentList.name}”` : 'Choose or create a list to share';
}

export function NavBar({ currentList, onCreate, onShare }: NavBarProps) {
  const pathname = usePathname();
  const onLibrary = pathname === NAV_HREFS.home;

  return (
    <>
      <DesktopNav
        currentList={currentList}
        onCreate={onCreate}
        onShare={onShare}
        onLibrary={onLibrary}
      />
      <MobileNav
        currentList={currentList}
        onCreate={onCreate}
        onShare={onShare}
        onLibrary={onLibrary}
      />
    </>
  );
}

interface NavVariantProps extends NavBarProps {
  onLibrary: boolean;
}

const desktopItem = cn(
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium whitespace-nowrap text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground aria-[current=page]:bg-accent aria-[current=page]:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  focusRing,
);

function DesktopNav({ currentList, onCreate, onShare, onLibrary }: NavVariantProps) {
  return (
    <nav aria-label="Main" className="hidden min-w-0 flex-1 xl:block" data-testid="nav-desktop">
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          <Link
            href={NAV_HREFS.home}
            className={desktopItem}
            aria-current={onLibrary ? 'page' : undefined}
          >
            <House aria-hidden />
            Home
          </Link>
        </li>
        <li>
          <Link href={NAV_HREFS.search} className={desktopItem}>
            <Search aria-hidden />
            Search library
          </Link>
        </li>
        <li>
          <Link href={NAV_HREFS.openSetlist} className={desktopItem}>
            <ListMusic aria-hidden />
            Open setlist
          </Link>
        </li>
        <li>
          <Link href={NAV_HREFS.openPlaylist} className={desktopItem}>
            <Headphones aria-hidden />
            Open playlist
          </Link>
        </li>
        {CREATE_ITEMS.map(({ type, label, icon: Icon }) => (
          <li key={type}>
            <button type="button" className={desktopItem} onClick={() => onCreate(type)}>
              <Icon aria-hidden />
              {label}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className={desktopItem}
            disabled={currentList === null}
            title={shareTitle(currentList)}
            onClick={() => {
              if (currentList) onShare();
            }}
          >
            <Share2 aria-hidden />
            Share{' '}
            <span className="sr-only">
              {currentList ? `“${currentList.name}”` : '(no current list)'}
            </span>
          </button>
        </li>
        {NAV_OVERFLOW_LINKS.length > 0 ? (
          <li>
            <DropdownMenu>
              <DropdownMenuTrigger className={desktopItem}>
                <Ellipsis aria-hidden />
                More
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <OverflowLinks />
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

const tabItem = cn(
  'flex h-14 w-full min-w-10 flex-col items-center justify-center gap-0.5 rounded-md text-xs font-medium text-foreground/70 transition-colors hover:text-foreground aria-[current=page]:text-foreground data-[state=open]:text-foreground [&_svg]:size-5 [&_svg]:shrink-0',
  focusRing,
);

function MobileNav({ currentList, onCreate, onShare, onLibrary }: NavVariantProps) {
  return (
    <nav
      aria-label="Main"
      data-testid="nav-mobile"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] xl:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5 gap-1 px-1">
        <li>
          <Link
            href={NAV_HREFS.home}
            className={tabItem}
            aria-current={onLibrary ? 'page' : undefined}
          >
            <House aria-hidden />
            Home
          </Link>
        </li>
        <li>
          <Link href={NAV_HREFS.search} className={tabItem}>
            <Search aria-hidden />
            Search
          </Link>
        </li>
        <li>
          <Link href={NAV_HREFS.openSetlist} className={tabItem}>
            <ListMusic aria-hidden />
            Setlists
          </Link>
        </li>
        <li>
          <Link href={NAV_HREFS.openPlaylist} className={tabItem}>
            <Headphones aria-hidden />
            Playlists
          </Link>
        </li>
        <li>
          <DropdownMenu>
            <DropdownMenuTrigger className={tabItem}>
              <Ellipsis aria-hidden />
              More
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="min-w-60">
              <DropdownMenuGroup>
                {CREATE_ITEMS.map(({ type, label, icon: Icon }) => (
                  <DropdownMenuItem key={type} className="min-h-10" onSelect={() => onCreate(type)}>
                    <Icon aria-hidden />
                    {label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="min-h-10"
                disabled={currentList === null}
                onSelect={() => {
                  if (currentList) onShare();
                }}
              >
                <Share2 aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span>Share</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {currentList ? currentList.name : 'No current list'}
                  </span>
                </span>
              </DropdownMenuItem>
              {NAV_OVERFLOW_LINKS.length > 0 ? (
                <>
                  <DropdownMenuSeparator />
                  <OverflowLinks />
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ul>
    </nav>
  );
}

function OverflowLinks() {
  return (
    <DropdownMenuGroup>
      {NAV_OVERFLOW_LINKS.map(({ href, label, icon: Icon }) => (
        <DropdownMenuItem key={href} asChild className="min-h-10">
          <Link href={href}>
            <Icon aria-hidden />
            {label}
          </Link>
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  );
}

export interface UserMenuProps {
  name: string;
  email: string;
  /** Branch display name, or null for users without a branch. */
  branchName: string | null;
  /** Server action that ends the session and redirects to `/login`. */
  signOut(): Promise<void>;
}

/** Account menu in the app header: who is signed in, their branch, and Sign out. */
export function UserMenu({ name, email, branchName, signOut }: UserMenuProps) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <>
      <form ref={formRef} action={signOut} hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-lg" aria-label="Account" className={focusRing}>
            <CircleUser aria-hidden className="size-6" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel className="flex flex-col gap-0.5">
            <span className="truncate">{name}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {branchName ?? 'No branch'}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-10" onSelect={() => formRef.current?.requestSubmit()}>
            <LogOut aria-hidden />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
