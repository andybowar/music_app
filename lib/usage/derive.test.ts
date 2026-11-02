import { describe, expect, test } from 'vitest';

import { deriveUsageLevel, localDate, usageWindow } from './derive';

describe('deriveUsageLevel', () => {
  test.each([
    [0, 'none'],
    [1, 'rare'],
    [2, 'low'],
    [5, 'low'],
    [6, 'high'],
    [40, 'high'],
  ] as const)('%i setlists → %s', (count, level) => {
    expect(deriveUsageLevel(count)).toBe(level);
  });

  test('counts below a threshold stay at the level beneath it', () => {
    expect(deriveUsageLevel(-1)).toBe('none');
    expect(deriveUsageLevel(0.5)).toBe('none');
    expect(deriveUsageLevel(5.9)).toBe('low');
  });
});

describe('localDate', () => {
  test('uses the date in the given time zone, not UTC', () => {
    // 04:30 UTC on 2 Nov is still 1 Nov in Chicago (UTC-6 in November).
    const now = new Date('2026-11-02T04:30:00Z');
    expect(localDate(now)).toBe('2026-11-01');
    expect(localDate(now, 'UTC')).toBe('2026-11-02');
  });
});

describe('usageWindow', () => {
  test('covers the 365 days ending today in Chicago', () => {
    expect(usageWindow(new Date('2026-11-02T09:00:00Z'))).toEqual({
      from: '2025-11-03',
      to: '2026-11-02',
    });
  });

  test('handles a leap day inside the window', () => {
    expect(usageWindow(new Date('2028-03-01T12:00:00Z'), 'UTC')).toEqual({
      from: '2027-03-03',
      to: '2028-03-01',
    });
  });

  test('crosses a year boundary', () => {
    expect(usageWindow(new Date('2027-01-01T12:00:00Z'), 'UTC')).toEqual({
      from: '2026-01-02',
      to: '2027-01-01',
    });
  });
});
