/**
 * Colour themes (owner request, 2026-11-09). Every theme is dark; the colours live in
 * app/globals.css: `.dark` is the default (warm slate), `.dark[data-theme='…']` the others.
 * The choice is saved on the device (localStorage), like the capo.
 */

export const THEMES = [
  { id: 'slate', label: 'Warm slate', page: '#171412' },
  { id: 'charcoal', label: 'Charcoal', page: '#121212' },
  { id: 'navy', label: 'Deep navy', page: '#0b1220' },
  { id: 'logo-blue', label: 'Logo blue', page: '#05070d' },
  { id: 'logo-flame', label: 'Logo flame', page: '#0a0806' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const DEFAULT_THEME: ThemeId = 'slate';
export const THEME_STORAGE_KEY = 'theme';

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/**
 * Runs before the page paints (inline in app/layout.tsx) so a chosen theme doesn't flash the
 * default first. Kept tiny and self-contained: it can't import anything.
 */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!==${JSON.stringify(DEFAULT_THEME)}&&${JSON.stringify(
  THEMES.map((t) => t.id),
)}.indexOf(t)>=0)document.documentElement.dataset.theme=t}catch(e){}`;
