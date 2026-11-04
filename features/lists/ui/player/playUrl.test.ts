import { describe, expect, it } from 'vitest';

import { parsePlayParams, withPlayParams } from './playUrl';

describe('parsePlayParams', () => {
  it('reads a 1-based song and the role', () => {
    expect(parsePlayParams('?play=3&as=vocalist', 5)).toEqual({ index: 2, role: 'vocalist' });
  });

  it('opens song 1 for a malformed or out-of-range number, and asks for an unknown role', () => {
    expect(parsePlayParams('?play=0&as=musician', 5)).toEqual({ index: 0, role: 'musician' });
    expect(parsePlayParams('?play=9', 5)).toEqual({ index: 0, role: null });
    expect(parsePlayParams('?play=two&as=drummer', 5)).toEqual({ index: 0, role: null });
    expect(parsePlayParams('?play=', 5)).toEqual({ index: 0, role: null });
  });

  it('is null without play or without songs', () => {
    expect(parsePlayParams('', 5)).toBeNull();
    expect(parsePlayParams('?as=musician', 5)).toBeNull();
    expect(parsePlayParams('?play=1', 0)).toBeNull();
  });
});

describe('withPlayParams', () => {
  it('sets and clears the player params, keeping others', () => {
    expect(withPlayParams('?x=1', { index: 1, role: 'projectionist' })).toBe(
      '?x=1&play=2&as=projectionist',
    );
    expect(withPlayParams('?x=1&play=2&as=vocalist', null)).toBe('?x=1');
    expect(withPlayParams('?play=2&as=vocalist', null)).toBe('');
  });
});
