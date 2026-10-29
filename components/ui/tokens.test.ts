import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENERGY_LEVELS, ENERGY_META } from '@/types/domain';
import {
  ENERGY_FOREGROUND_HEX,
  ENERGY_TOKEN,
  POP_TOKEN,
  contrastRatio,
  relativeLuminance,
} from './tokens';

const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

function cssVar(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!m?.[1]) throw new Error(`--${name} not found in globals.css`);
  return m[1].toUpperCase();
}

const ROW = '#2B2B2B';
const WHITE = '#FFFFFF';

describe('contrast helpers', () => {
  it('computes WCAG luminance and ratios', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 10);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 10);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 10);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });

  it('rejects non-#RRGGBB input', () => {
    expect(() => relativeLuminance('red')).toThrow(/#RRGGBB/);
    expect(() => relativeLuminance('#fff')).toThrow(/#RRGGBB/);
  });
});

describe('energy tokens', () => {
  it.each(ENERGY_LEVELS)('%s uses the ENERGY_META hex in globals.css and tokens.ts', (level) => {
    expect(cssVar(`energy-${level}`)).toBe(ENERGY_META[level].hex.toUpperCase());
    expect(ENERGY_TOKEN[level].hex).toBe(ENERGY_META[level].hex);
    expect(cssVar(`energy-${level}-foreground`)).toBe(ENERGY_FOREGROUND_HEX[level]);
    expect(css).toContain(`--color-energy-${level}: var(--energy-${level});`);
    expect(ENERGY_TOKEN[level].bg).toBe(`bg-energy-${level}`);
    expect(ENERGY_TOKEN[level].fg).toBe(`text-energy-${level}-foreground`);
  });

  it.each(ENERGY_LEVELS)('%s label text meets AA (4.5:1) on its fill', (level) => {
    expect(
      contrastRatio(ENERGY_META[level].hex, ENERGY_FOREGROUND_HEX[level]),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ENERGY_LEVELS)('%s chip has a >= 3:1 boundary on the row (fill or ring)', (level) => {
    const fill = contrastRatio(ENERGY_META[level].hex, ROW);
    const ring = contrastRatio(cssVar('energy-ring'), ROW);
    expect(Math.max(fill, ring)).toBeGreaterThanOrEqual(3);
  });
});

describe('row and POP tokens', () => {
  it('row is #2B2B2B with white text (AA)', () => {
    expect(cssVar('row')).toBe(ROW);
    expect(cssVar('row-foreground')).toBe(WHITE);
    expect(contrastRatio(ROW, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('POP colors match the contract and meet AA on their surfaces', () => {
    expect(cssVar('pop-current')).toBe('#4CAF50');
    expect(cssVar('pop-past')).toBe('#8BBF8D');
    for (const name of ['pop-current', 'pop-past']) {
      expect(contrastRatio(cssVar(name), ROW)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(cssVar(`${name}-on-light`), WHITE)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('POP titles match the contract wording', () => {
    expect(POP_TOKEN.current.title).toBe('People of Praise member (current)');
    expect(POP_TOKEN.past.title).toBe('People of Praise member (past)');
  });
});
