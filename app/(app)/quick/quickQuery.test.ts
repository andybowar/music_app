import { describe, expect, it } from 'vitest';

import { searchParamsSchema, serializeSearchParams } from '@/types/validation';

import {
  libraryHref,
  parseQuickQuery,
  QUICK_FULL,
  QUICK_TOP,
  quickHref,
  quickSearchParams,
} from './quickQuery';

describe('parseQuickQuery', () => {
  it('reads and trims q; full only for "1"', () => {
    expect(parseQuickQuery({ q: '  grace ', full: '1' })).toEqual({ q: 'grace', full: true });
    expect(parseQuickQuery({ q: 'grace', full: 'yes' })).toEqual({ q: 'grace', full: false });
  });

  it('takes the first of repeated params', () => {
    expect(parseQuickQuery({ q: ['cross', 'grace'], full: ['1', '0'] })).toEqual({
      q: 'cross',
      full: true,
    });
  });

  it('defaults to an empty lookup', () => {
    expect(parseQuickQuery({})).toEqual({ q: '', full: false });
    expect(parseQuickQuery(undefined)).toEqual({ q: '', full: false });
    expect(parseQuickQuery({ q: [] })).toEqual({ q: '', full: false });
  });
});

describe('quickHref', () => {
  it('encodes q and adds full=1 only when on', () => {
    expect(quickHref({ q: 'the cross', full: false })).toBe('/quick?q=the+cross');
    expect(quickHref({ q: ' joy&peace ', full: true })).toBe('/quick?q=joy%26peace&full=1');
  });

  it('is the bare page for empty text', () => {
    expect(quickHref({ q: '   ', full: true })).toBe('/quick');
  });

  it('round-trips through parseQuickQuery', () => {
    const q = { q: 'Holy Spirit', full: true };
    const params = Object.fromEntries(new URLSearchParams(quickHref(q).split('?')[1]));
    expect(parseQuickQuery(params)).toEqual(q);
  });
});

describe('quickSearchParams', () => {
  it('searches themes + lyrics, top 12', () => {
    expect(quickSearchParams({ q: 'grace', full: false })).toEqual({
      q: 'grace',
      fields: ['themes', 'lyrics'],
      pageSize: QUICK_TOP,
    });
    expect(QUICK_TOP).toBe(12);
  });

  it('show full asks for the maximum page', () => {
    expect(quickSearchParams({ q: 'grace', full: true }).pageSize).toBe(QUICK_FULL);
  });

  it('passes search validation unchanged (no sort: relevance order)', () => {
    const p = quickSearchParams({ q: 'grace', full: true });
    const normalized = searchParamsSchema.parse(serializeSearchParams(p));
    expect(normalized).toMatchObject({ q: p.q, pageSize: p.pageSize });
    expect([...(normalized.fields ?? [])].sort()).toEqual(['lyrics', 'themes']);
    expect(p.sort).toBeUndefined();
  });
});

describe('libraryHref', () => {
  it('opens the same search on the library page', () => {
    const href = libraryHref(' grace ');
    expect(href.startsWith('/library?')).toBe(true);
    const parsed = searchParamsSchema.parse(href.split('?')[1]);
    expect(parsed.q).toBe('grace');
    expect([...(parsed.fields ?? [])].sort()).toEqual(['lyrics', 'themes']);
  });

  it('is the bare library for empty text', () => {
    expect(libraryHref('')).toBe('/library');
  });
});
