/**
 * TEMPORARY theme trial (owner request, 2026-11-09): five dark palettes to try on staging.
 * The colours live in app/globals.css under `.dark[data-theme='…']`. Remove this folder once a
 * palette is chosen.
 */

export const THEMES = [
  { id: 'charcoal', label: '1 · Neutral charcoal', page: '#121212' },
  { id: 'navy', label: '2 · Deep navy', page: '#0b1220' },
  { id: 'slate', label: '3 · Warm slate + amber', page: '#171412' },
  { id: 'logo-blue', label: '4 · Logo blue', page: '#05070d' },
  { id: 'logo-flame', label: '5 · Logo flame', page: '#0a0806' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const DEFAULT_THEME: ThemeId = 'charcoal';
export const THEME_STORAGE_KEY = 'theme-trial';

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/**
 * Runs before the page paints (inline in app/layout.tsx) so a chosen theme doesn't flash the
 * default first. Kept tiny and self-contained: it can't import anything.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(${JSON.stringify(THEMES.map((t) => t.id))}.indexOf(t)>0)document.documentElement.dataset.theme=t}catch(e){}`;
