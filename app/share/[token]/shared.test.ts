import { describe, expect, it } from 'vitest';

import { LIST_IDS, getItemsForList, getList, getSong } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';
import type { ListDetail } from '@/types/domain';

import { formatEventDate, signInHref, songCountLabel, toSharedList } from './shared';

function detailOf(id: string): ListDetail {
  return {
    ...getList(id),
    items: getItemsForList(id).map((i) => resolveItemDisplay(getSong(i.songId), i)),
  };
}

const setlist = detailOf(LIST_IDS.bg41926);

describe('toSharedList', () => {
  it('keeps the header fields and every item with its overrides', () => {
    const shared = toSharedList(setlist);
    expect(shared).toMatchObject({
      id: setlist.id,
      type: setlist.type,
      name: setlist.name,
      eventDate: setlist.eventDate,
      branchCode: setlist.branchCode,
    });
    expect(shared.items).toHaveLength(setlist.items.length);
    shared.items.forEach((item, i) => {
      const source = setlist.items[i]!;
      expect(item.key).toBe(source.key);
      expect(item.bpm).toBe(source.bpm);
      expect(item.energy).toBe(source.energy);
      expect(item.isOverridden).toEqual(source.isOverridden);
      expect(item.firstChords).toEqual(source.firstChords);
      expect(item.item.overrideKey).toBe(source.item.overrideKey);
    });
  });

  it('drops the owner, branch id, timestamps and notes', () => {
    const withNotes: ListDetail = {
      ...setlist,
      items: setlist.items.map((r) => ({ ...r, item: { ...r.item, notes: 'private note' } })),
    };
    const shared = toSharedList(withNotes);
    const json = JSON.stringify(shared);
    expect(Object.keys(shared).sort()).toEqual(
      ['branchCode', 'eventDate', 'id', 'items', 'name', 'type'].sort(),
    );
    expect(json).not.toContain(setlist.ownerName);
    expect(json).not.toContain(setlist.ownerId);
    expect(json).not.toContain('private note');
  });

  it('never passes on a way to open a file', () => {
    const leaky: ListDetail = {
      ...setlist,
      items: setlist.items.map((r) => ({
        ...r,
        resources: r.resources.map((res) => ({
          ...res,
          url: 'https://files.example/secret',
          storagePath: 'songs/secret.pdf',
          uploadedBy: '20000000-0000-4000-8000-0000000000aa',
        })),
      })),
    };
    const shared = toSharedList(leaky);
    expect(shared.items.some((i) => i.resources.length > 0)).toBe(true);
    for (const item of shared.items) {
      for (const r of item.resources) {
        expect(r).toMatchObject({ url: null, storagePath: null });
        expect(r).not.toHaveProperty('uploadedBy');
      }
    }
  });
});

describe('signInHref', () => {
  it('returns a setlist recipient to the setlist after sign-in', () => {
    expect(signInHref({ id: 'abc', type: 'setlist' })).toBe('/login?next=%2Flists%2Fabc');
  });

  it('sends a playlist recipient to plain sign-in (playlists are private)', () => {
    expect(signInHref({ id: 'abc', type: 'playlist' })).toBe('/login');
  });
});

describe('formatting', () => {
  it('formats a plain date without shifting the day', () => {
    expect(formatEventDate('2026-04-19', 'en-US')).toBe('Sunday, April 19, 2026');
    expect(formatEventDate('not a date')).toBe('not a date');
  });

  it('counts songs', () => {
    expect(songCountLabel(1)).toBe('1 song');
    expect(songCountLabel(0)).toBe('0 songs');
  });
});
