// @vitest-environment node
import type { ListDetail, ResolvedItem } from '@/types/domain';

import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';

import { getItemsForList, getList, getSong, LIST_IDS } from '@/fixtures';
import { resolveItemDisplay } from '@/lib/lists/resolve';

import { formatEmailDate, itemDetails, ShareList, shareListSubject } from './ShareList';

const URL = 'https://app.example.test/share/token';

function listDetail(id: string): ListDetail {
  const items = getItemsForList(id).map((item) => resolveItemDisplay(getSong(item.songId), item));
  return { ...getList(id), items };
}

const setlist = listDetail(LIST_IDS.bg41926);

function withOverride(item: ResolvedItem, patch: Partial<ResolvedItem>): ResolvedItem {
  return { ...item, ...patch };
}

describe('itemDetails', () => {
  const base = setlist.items[0]!;
  const plain = withOverride(base, {
    key: 'D',
    bpm: 72,
    energy: 'deep_worship',
    isOverridden: { key: false, bpm: false, energy: false },
  });

  it('lists key, BPM and energy label', () => {
    expect(itemDetails(plain)).toEqual(['Key D', '72 BPM', "Deep 'Worship'"]);
  });

  it('marks overrides with the song’s own value', () => {
    const song = {
      ...base.song,
      primaryKey: 'D',
      tempoBpm: 72,
      energyLevel: 'deep_worship' as const,
    };
    const changed = withOverride(plain, {
      song,
      key: 'E',
      bpm: 80,
      energy: 'high_praise',
      isOverridden: { key: true, bpm: true, energy: true },
    });
    expect(itemDetails(changed)).toEqual([
      'Key E (changed from D)',
      '80 BPM (changed from 72)',
      "High Energy 'Praise' (changed from Deep 'Worship')",
    ]);
  });

  it('marks overrides without an original value', () => {
    const song = { ...base.song, primaryKey: null, tempoBpm: null, energyLevel: null };
    const changed = withOverride(plain, {
      song,
      isOverridden: { key: true, bpm: true, energy: true },
    });
    expect(itemDetails(changed)).toEqual([
      'Key D (changed)',
      '72 BPM (changed)',
      "Deep 'Worship' (changed)",
    ]);
  });

  it('skips unknown values', () => {
    expect(itemDetails(withOverride(plain, { key: null, bpm: null, energy: null }))).toEqual([]);
  });
});

describe('ShareList', () => {
  it('renders every song in order with the link, in HTML and text', async () => {
    const element = <ShareList list={setlist} url={URL} senderName="Ana" />;
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

    expect(html).toContain(`href="${URL}"`);
    expect(text).toContain(URL);
    expect(text).toContain(setlist.name);
    expect(text).toContain('Ana shared this list with you.');
    let last = -1;
    setlist.items.forEach((item, index) => {
      const at = text.indexOf(`${index + 1}. ${item.song.title}`);
      expect(at).toBeGreaterThan(last);
      last = at;
      for (const detail of itemDetails(item)) expect(text).toContain(detail);
    });
    if (setlist.eventDate) expect(text).toContain(formatEmailDate(setlist.eventDate));
  });

  it('says when the list is empty', async () => {
    const empty = { ...setlist, eventDate: null, branchCode: null, items: [] };
    const text = await render(<ShareList list={empty} url={URL} senderName="Ana" />, {
      plainText: true,
    });
    expect(text).toContain('This list has no songs yet.');
    expect(text).toContain('0 songs');
  });
});

describe('helpers', () => {
  it('builds the subject', () => {
    expect(shareListSubject({ name: 'Sunday' }, 'Ana')).toBe('Ana shared “Sunday” with you');
  });

  it('formats plain dates without shifting the day', () => {
    expect(formatEmailDate('2026-11-08')).toBe('Sunday, November 8, 2026');
    expect(formatEmailDate('nope')).toBe('nope');
  });
});
