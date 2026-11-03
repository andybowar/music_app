import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import { LIST_IDS, SONG_IDS, getItemsForList, getList, getSong } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import type { ListDetail } from '@/types/domain';

import { SharedListView } from './SharedListView';
import { toSharedList, type SharedList } from './shared';

afterEach(cleanup);

function sharedOf(id: string): SharedList {
  const detail: ListDetail = {
    ...getList(id),
    items: getItemsForList(id).map((i) => resolveItemDisplay(getSong(i.songId), i)),
  };
  return toSharedList(detail);
}

const setlist = sharedOf(LIST_IDS.bg41926);
const playlist = sharedOf(LIST_IDS.background1);

function rowFor(title: string) {
  return screen.getByRole('group', { name: title });
}

describe('SharedListView', () => {
  it('shows the header: name, date, song count and branch', () => {
    render(<SharedListView list={setlist} />);
    expect(screen.getByRole('heading', { level: 1, name: setlist.name })).toBeInTheDocument();
    expect(screen.getByText('Shared setlist')).toBeInTheDocument();
    const time = document.querySelector('time');
    expect(time).toHaveAttribute('datetime', setlist.eventDate);
    expect(screen.getByText(/4 songs/)).toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(within(header).getByText(setlist.branchCode!)).toBeInTheDocument();
  });

  it('lists every song in order with its overrides', () => {
    render(<SharedListView list={setlist} />);
    const list = screen.getByRole('list', { name: `Songs in ${setlist.name}` });
    const rows = within(list).getAllByRole('group');
    expect(rows.map((r) => r.getAttribute('aria-label'))).toEqual(
      setlist.items.map((i) => i.song.title),
    );
    // The C override on the third item shows as an overridden key.
    const overridden = setlist.items.find((i) => i.item.overrideKey === 'C')!;
    expect(
      within(rowFor(overridden.song.title)).getByRole('img', { name: /^Key C/ }),
    ).toHaveAttribute('data-overridden', 'true');
  });

  it('points to sign-in to open files, returning to the setlist', () => {
    render(<SharedListView list={setlist} />);
    const cta = screen.getByRole('link', { name: 'Sign in to open files' });
    expect(cta).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent(`/lists/${setlist.id}`)}`,
    );
  });

  it('opens a resources panel that lists files but cannot open them', async () => {
    const user = userEvent.setup();
    render(<SharedListView list={setlist} />);
    const withFiles = setlist.items.find((i) => i.resources.length > 0)!;
    await user.click(
      within(rowFor(withFiles.song.title)).getByRole('button', { name: /show resources/ }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(`Resources · ${withFiles.song.title}`);
    for (const r of withFiles.resources) expect(dialog).toHaveTextContent(r.label);
    expect(within(dialog).getByRole('link', { name: 'Sign in to open files' })).toBeInTheDocument();
    expect(
      within(dialog)
        .queryAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual([`/login?next=${encodeURIComponent(`/lists/${setlist.id}`)}`]);
  });

  it('shows the key and first chords for this list', async () => {
    const user = userEvent.setup();
    render(<SharedListView list={setlist} />);
    const item = setlist.items[0]!;
    await user.click(
      within(rowFor(item.song.title)).getByRole('button', { name: /show all keys/ }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Key and first chords');
    expect(dialog).toHaveTextContent('Key for this list');
    expect(dialog).toHaveTextContent('Chorus');
  });

  it('shows composers, and asks for sign-in for lyrics and usage', async () => {
    const user = userEvent.setup();
    render(<SharedListView list={setlist} />);
    const song = getSong(SONG_IDS.thousandHallelujahs);
    const row = rowFor(song.title);

    await user.click(within(row).getByRole('button', { name: /show all composers/ }));
    let dialog = await screen.findByRole('dialog');
    for (const c of song.composers) expect(dialog).toHaveTextContent(c.name);
    await user.keyboard('{Escape}');

    await user.click(within(row).getByRole('button', { name: /show first lines/ }));
    dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('link', { name: 'Sign in to see the lyrics' }),
    ).toBeInTheDocument();
    if (song.chorusLine) expect(dialog).not.toHaveTextContent(song.chorusLine);
    await user.keyboard('{Escape}');

    await user.click(within(row).getByRole('button', { name: /show branch usage/ }));
    dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Added by');
    expect(
      within(dialog).getByRole('link', { name: 'Sign in to see branch usage' }),
    ).toBeInTheDocument();
  });

  it('sends playlist recipients to plain sign-in', () => {
    render(<SharedListView list={playlist} />);
    expect(screen.getByText('Shared playlist')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in to open files' })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('has an empty state', () => {
    render(<SharedListView list={{ ...setlist, items: [] }} />);
    expect(screen.getByText('No songs in this setlist yet.')).toBeInTheDocument();
    expect(screen.getByText(/0 songs/)).toBeInTheDocument();
  });
});
