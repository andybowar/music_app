import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_SPEED,
  clampInt,
  parseRole,
  readSpeed,
  readTextStep,
  writeSpeed,
  writeTextStep,
} from './playerPrefs';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('playerPrefs', () => {
  it('parses roles', () => {
    expect(parseRole('musician')).toBe('musician');
    expect(parseRole('projectionist')).toBe('projectionist');
    expect(parseRole('drummer')).toBeNull();
    expect(parseRole(null)).toBeNull();
  });

  it('clamps whole numbers and falls back on junk', () => {
    expect(clampInt('7', 1, 10, 3)).toBe(7);
    expect(clampInt(12, 1, 10, 3)).toBe(10);
    expect(clampInt(-4, 1, 10, 3)).toBe(1);
    expect(clampInt(2.6, 1, 10, 3)).toBe(3);
    expect(clampInt('abc', 1, 10, 3)).toBe(3);
    expect(clampInt(null, 1, 10, 3)).toBe(3);
  });

  it('keeps the speed per song and the text size for the device', () => {
    expect(readSpeed('song-a')).toBe(DEFAULT_SPEED);
    writeSpeed('song-a', 8);
    writeSpeed('song-b', 99);
    expect(readSpeed('song-a')).toBe(8);
    expect(readSpeed('song-b')).toBe(10);
    expect(readTextStep()).toBe(0);
    writeTextStep(2);
    expect(readTextStep()).toBe(2);
    writeTextStep(9);
    expect(readTextStep()).toBe(3);
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => writeSpeed('song-a', 5)).not.toThrow();
    expect(readSpeed('song-a')).toBe(DEFAULT_SPEED);
    expect(() => writeTextStep(1)).not.toThrow();
    expect(readTextStep()).toBe(0);
  });
});
