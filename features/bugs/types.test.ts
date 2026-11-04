// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  BUG_IMAGE_WINDOW_MS,
  BUG_REPORTS_PER_HOUR,
  bugHref,
  bugReportInputSchema,
  bugReportPatchSchema,
  isBugReportStatus,
  isOverHourlyLimit,
  isSafePagePath,
  listBugReportsSchema,
  pagePathFrom,
  withinImageWindow,
} from './types';

const base = { title: 'Broken', description: 'It broke' };

describe('bugReportInputSchema', () => {
  it('accepts the minimum and normalizes blanks to null', () => {
    expect(
      bugReportInputSchema.parse({ ...base, expected: '  ', pagePath: '', userAgent: ' ' }),
    ).toEqual({ ...base, expected: null, pagePath: null, userAgent: null });
  });

  it.each([
    ['title', { title: '' }],
    ['title', { title: '   ' }],
    ['title', { title: 'x'.repeat(201) }],
    ['description', { description: '' }],
    ['description', { description: 'x'.repeat(10_001) }],
    ['expected', { expected: 'x'.repeat(2_001) }],
    ['pagePath', { pagePath: 'https://evil.example/' }],
    ['pagePath', { pagePath: '//evil.example/' }],
  ])('rejects a bad %s', (field, patch) => {
    const result = bugReportInputSchema.safeParse({ ...base, ...patch });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe(field);
  });

  it('accepts the limits exactly', () => {
    const result = bugReportInputSchema.safeParse({
      title: 'x'.repeat(200),
      description: 'x'.repeat(10_000),
      expected: 'x'.repeat(2_000),
      pagePath: '/songs/1?tab=keys#a',
    });
    expect(result.success).toBe(true);
  });

  it('trims captured details to the column limits instead of rejecting', () => {
    const out = bugReportInputSchema.parse({
      ...base,
      userAgent: 'u'.repeat(1_500),
      viewport: 'v'.repeat(60),
    });
    expect(out.userAgent).toHaveLength(1_000);
    expect(out.viewport).toHaveLength(40);
  });

  it('refuses unknown keys', () => {
    expect(bugReportInputSchema.safeParse({ ...base, status: 'fixed' }).success).toBe(false);
  });
});

describe('isSafePagePath', () => {
  it.each(['/', '/library', '/songs/abc?x=1', '/lists/1#top', '/a%20b'])('allows %s', (p) =>
    expect(isSafePagePath(p)).toBe(true),
  );
  it.each([
    '',
    'library',
    'https://x.example/',
    '//x.example',
    '/\\x.example',
    'javascript:alert(1)',
    '/a b',
    '/a\nb',
    '/a\\b',
    `/${'x'.repeat(2_000)}`,
  ])('refuses %j', (p) => expect(isSafePagePath(p)).toBe(false));
});

describe('pagePathFrom', () => {
  it('takes the first safe value', () => {
    expect(pagePathFrom('/library')).toBe('/library');
    expect(pagePathFrom(['/a', '/b'])).toBe('/a');
    expect(pagePathFrom('//evil.example')).toBeUndefined();
    expect(pagePathFrom(undefined)).toBeUndefined();
  });
});

describe('bugReportPatchSchema', () => {
  it('takes a status and/or a note; a blank note clears it', () => {
    expect(bugReportPatchSchema.parse({ status: 'fixed' })).toEqual({ status: 'fixed' });
    expect(bugReportPatchSchema.parse({ adminNote: '  ' })).toEqual({ adminNote: null });
    expect(bugReportPatchSchema.parse({ adminNote: null })).toEqual({ adminNote: null });
  });
  it('limits the note and the status values', () => {
    expect(bugReportPatchSchema.safeParse({ adminNote: 'x'.repeat(2_001) }).success).toBe(false);
    expect(bugReportPatchSchema.safeParse({ adminNote: 'x'.repeat(2_000) }).success).toBe(true);
    expect(bugReportPatchSchema.safeParse({ status: 'done' }).success).toBe(false);
    expect(bugReportPatchSchema.safeParse({ title: 'x' }).success).toBe(false);
  });
});

describe('listBugReportsSchema', () => {
  it('takes an optional status', () => {
    expect(listBugReportsSchema.parse(undefined)).toBeUndefined();
    expect(listBugReportsSchema.parse({ status: 'new' })).toEqual({ status: 'new' });
    expect(listBugReportsSchema.safeParse({ status: 'nope' }).success).toBe(false);
  });
});

describe('limits', () => {
  it('rate limit: the 11th report in an hour is refused', () => {
    expect(BUG_REPORTS_PER_HOUR).toBe(10);
    expect(isOverHourlyLimit(9)).toBe(false);
    expect(isOverHourlyLimit(10)).toBe(true);
  });

  it('screenshots: only within 24 hours of the report', () => {
    const created = new Date('2026-11-01T00:00:00Z');
    const t = created.getTime();
    expect(withinImageWindow(created, t + BUG_IMAGE_WINDOW_MS - 1)).toBe(true);
    expect(withinImageWindow(created, t + BUG_IMAGE_WINDOW_MS)).toBe(false);
  });
});

describe('helpers', () => {
  it('isBugReportStatus', () => {
    expect(isBugReportStatus('wont_fix')).toBe(true);
    expect(isBugReportStatus('done')).toBe(false);
    expect(isBugReportStatus(undefined)).toBe(false);
  });
  it('bugHref', () => {
    expect(bugHref('1')).toBe('/bugs/1');
    expect(bugHref('1', true)).toBe('/admin/bugs/1');
  });
});
