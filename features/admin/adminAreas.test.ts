// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { users } from '@/fixtures';
import type { AppUser, Role } from '@/types/domain';

import { adminAreasFor, canSeeAdmin } from './adminAreas';

const as = (role: Role, over: Partial<AppUser> = {}): AppUser => ({
  ...users[0]!,
  role,
  accessStatus: 'approved',
  disabledAt: null,
  ...over,
});

describe('adminAreasFor', () => {
  it('gives admins every area, in order', () => {
    expect(adminAreasFor(as('admin')).map((a) => a.id)).toEqual([
      'users',
      'branches',
      'themes',
      'galleries',
    ]);
  });

  it('gives music leaders only Themes', () => {
    expect(adminAreasFor(as('music_leader')).map((a) => a.id)).toEqual(['themes']);
  });

  it.each(['member', 'contributor'] as const)('gives a %s nothing', (role) => {
    expect(adminAreasFor(as(role))).toEqual([]);
    expect(canSeeAdmin(as(role))).toBe(false);
  });

  it('gives disabled or pending admins nothing', () => {
    expect(adminAreasFor(as('admin', { disabledAt: '2026-01-01T00:00:00Z' }))).toEqual([]);
    expect(canSeeAdmin(as('admin', { accessStatus: 'pending' }))).toBe(false);
  });

  it('exposes plain data only', () => {
    for (const area of adminAreasFor(as('admin'))) {
      expect(Object.keys(area).sort()).toEqual(['description', 'href', 'id', 'title']);
    }
  });
});
