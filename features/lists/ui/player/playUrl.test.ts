import { describe, expect, it } from 'vitest';

import { parsePlayParams, withPlayParams } from './playUrl';

describe('parsePlayParams', () => {
  it('reads a 1-based song, ignoring an old role', () => {
    expect(parsePlayParams('?play=3', 5)).toBe(2);
    expect(parsePlayParams('?play=3&as=vocalist', 5)).toBe(2);
  });

  it('opens song 1 for a malformed or out-of-range number', () => {
    expect(parsePlayParams('?play=0', 5)).toBe(0);
    expect(parsePlayParams('?play=9', 5)).toBe(0);
    expect(parsePlayParams('?play=two', 5)).toBe(0);
    expect(parsePlayParams('?play=', 5)).toBe(0);
  });

  it('is null without play or without songs', () => {
    expect(parsePlayParams('', 5)).toBeNull();
    expect(parsePlayParams('?as=musician', 5)).toBeNull();
    expect(parsePlayParams('?play=1', 0)).toBeNull();
  });
});

describe('withPlayParams', () => {
  it('sets and clears the song, keeping other params and dropping an old role', () => {
    expect(withPlayParams('?x=1', 1)).toBe('?x=1&play=2');
    expect(withPlayParams('?x=1&play=2&as=vocalist', 0)).toBe('?x=1&play=1');
    expect(withPlayParams('?x=1&play=2&as=vocalist', null)).toBe('?x=1');
    expect(withPlayParams('?play=2', null)).toBe('');
  });
});
