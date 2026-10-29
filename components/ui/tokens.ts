import type { EnergyLevel, PopMember } from '@/types/domain';

/**
 * Static class names for the UI-01 theme tokens in `app/globals.css`. Tailwind only generates
 * classes it can see as literal strings, so map through these instead of building
 * `bg-energy-${level}` at runtime.
 *
 * WCAG 2.1 contrast checked for each energy fill (ENERGY_META hex):
 *
 * | level         | fill    | label text | label:fill | fill:row #2B2B2B |
 * |---------------|---------|------------|------------|------------------|
 * | high_praise   | #D7263D | #FFFFFF    | 4.96       | 2.85 (use ring)  |
 * | high_worship  | #F2B705 | #111111    | 10.39      | 7.79             |
 * | mid_worship   | #4CAF50 | #111111    | 6.79       | 5.09             |
 * | deep_worship  | #7B4FA0 | #FFFFFF    | 6.06       | 2.34 (use ring)  |
 * | quiet_worship | #3A8FD6 | #111111    | 5.47       | 4.10             |
 *
 * `ring` (1px white, 14.2:1 on the row) gives every chip a >= 3:1 boundary on the dark row.
 * Energy is never conveyed by color alone: chips always carry text (REQ-NF-03).
 */
export const ENERGY_TOKEN: Record<EnergyLevel, { bg: string; fg: string; hex: string }> = {
  high_praise: {
    bg: 'bg-energy-high_praise',
    fg: 'text-energy-high_praise-foreground',
    hex: '#D7263D',
  },
  high_worship: {
    bg: 'bg-energy-high_worship',
    fg: 'text-energy-high_worship-foreground',
    hex: '#F2B705',
  },
  mid_worship: {
    bg: 'bg-energy-mid_worship',
    fg: 'text-energy-mid_worship-foreground',
    hex: '#4CAF50',
  },
  deep_worship: {
    bg: 'bg-energy-deep_worship',
    fg: 'text-energy-deep_worship-foreground',
    hex: '#7B4FA0',
  },
  quiet_worship: {
    bg: 'bg-energy-quiet_worship',
    fg: 'text-energy-quiet_worship-foreground',
    hex: '#3A8FD6',
  },
};

/** Hex of each energy label color, matching ENERGY_TOKEN[level].fg. */
export const ENERGY_FOREGROUND_HEX: Record<EnergyLevel, string> = {
  high_praise: '#FFFFFF',
  high_worship: '#111111',
  mid_worship: '#111111',
  deep_worship: '#FFFFFF',
  quiet_worship: '#111111',
};

export const ENERGY_RING = 'ring-1 ring-energy-ring';

export type PopHighlight = Exclude<PopMember, 'none'>;

/**
 * POP composer highlight (contracts/ui.md). `text` is for the dark song row (current 5.09:1,
 * past 6.70:1 on #2B2B2B); `textOnLight` for white surfaces (current #2E7D32 5.13:1,
 * past #4E7A50 4.97:1 on #FFFFFF). Always pair with `title` so membership isn't color-only.
 */
export const POP_TOKEN: Record<PopHighlight, { text: string; textOnLight: string; title: string }> =
  {
    current: {
      text: 'text-pop-current',
      textOnLight: 'text-pop-current-on-light',
      title: 'People of Praise member (current)',
    },
    past: {
      text: 'text-pop-past',
      textOnLight: 'text-pop-past-on-light',
      title: 'People of Praise member (past)',
    },
  };

export const ROW_TOKEN = {
  surface: 'bg-row text-row-foreground',
  title: 'row-title',
  chipRadius: 'rounded-chip',
  tapTarget: 'min-h-tap min-w-tap',
} as const;

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG 2.1 relative luminance of a `#RRGGBB` color. */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Expected #RRGGBB, got ${hex}`);
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => channel(parseInt(x as string, 16))) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two `#RRGGBB` colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
