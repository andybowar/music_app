import { describe, expect, it } from 'vitest';
import {
  MAX_SCALE,
  MIN_SCALE,
  clampPage,
  clampScale,
  downloadName,
  formatTime,
  pinchScale,
  pointerDistance,
  stepScale,
} from './mediaMath';

describe('clampScale', () => {
  it('clamps to the allowed range and rounds to 2 decimals', () => {
    expect(clampScale(0.1)).toBe(MIN_SCALE);
    expect(clampScale(10)).toBe(MAX_SCALE);
    expect(clampScale(1.23456)).toBe(1.23);
  });
  it('falls back to 1 for non-finite input', () => {
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('stepScale', () => {
  it('steps by 0.25 from a value on the grid', () => {
    expect(stepScale(1, 1)).toBe(1.25);
    expect(stepScale(1, -1)).toBe(0.75);
  });
  it('snaps off-grid values to the next grid point in the step direction', () => {
    expect(stepScale(1.1, 1)).toBe(1.25);
    expect(stepScale(1.1, -1)).toBe(1);
  });
  it('stays within bounds', () => {
    expect(stepScale(MAX_SCALE, 1)).toBe(MAX_SCALE);
    expect(stepScale(MIN_SCALE, -1)).toBe(MIN_SCALE);
  });
});

describe('pinchScale / pointerDistance', () => {
  it('scales by the ratio of finger distances', () => {
    expect(pinchScale(1, 100, 200)).toBe(2);
    expect(pinchScale(2, 200, 100)).toBe(1);
    expect(pinchScale(1, 100, 10_000)).toBe(MAX_SCALE);
  });
  it('ignores a zero start distance', () => {
    expect(pinchScale(1.5, 0, 50)).toBe(1.5);
  });
  it('measures euclidean distance', () => {
    expect(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('clampPage', () => {
  it('clamps to [1, numPages]', () => {
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(4, 3)).toBe(3);
    expect(clampPage(2.7, 3)).toBe(2);
  });
  it('returns 1 while the page count is unknown or input is invalid', () => {
    expect(clampPage(5, null)).toBe(1);
    expect(clampPage(5, 0)).toBe(1);
    expect(clampPage(Number.NaN, 3)).toBe(1);
  });
});

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
  });
  it('adds hours from an hour up', () => {
    expect(formatTime(3725)).toBe('1:02:05');
  });
  it('shows a placeholder for unknown durations', () => {
    expect(formatTime(Number.NaN)).toBe('--:--');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('--:--');
    expect(formatTime(-1)).toBe('--:--');
  });
});

describe('downloadName', () => {
  it('uses the last path segment, without the query string', () => {
    expect(downloadName('https://x.test/a/b/Lead%20sheet.pdf?token=abc', 'Song')).toBe(
      'Lead sheet.pdf',
    );
    expect(downloadName('/dev/sample.pdf', 'Song')).toBe('sample.pdf');
  });
  it('falls back to a sanitised title when the URL has no file name', () => {
    expect(downloadName('blob:http://x.test/1234-5678', 'Song / Full: score')).toBe(
      'Song Full score.pdf',
    );
    expect(downloadName('https://x.test/sign', '  ', 'mp3')).toBe('download.mp3');
  });
  it('survives malformed URLs', () => {
    expect(downloadName('http://[::1', 'Song')).toBe('Song.pdf');
    expect(downloadName('/a/%E0%A4%A.pdf', 'Song')).toBe('Song.pdf');
  });
});
