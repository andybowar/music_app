'use client';

import { useEffect, useId, useState } from 'react';

import { DEFAULT_THEME, THEMES, THEME_STORAGE_KEY, isThemeId, type ThemeId } from './themes';

/** Sets the theme on <html> and the browser's address-bar colour. */
export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  if (id === DEFAULT_THEME) delete root.dataset.theme;
  else root.dataset.theme = id;
  const page = THEMES.find((t) => t.id === id)!.page;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', page);
}

/**
 * TEMPORARY switcher for trying the five dark palettes (not rendered on production). The
 * choice is remembered on this device. Sits bottom-left, above the phone tab bar.
 */
export function ThemeTrial() {
  const id = useId();
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemeId(saved)) setTheme(saved);
    } catch {
      // Storage blocked: stay on the default.
    }
  }, []);

  const change = (next: ThemeId) => {
    setTheme(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice lasts for this page only.
    }
  };

  return (
    <div
      className="fixed left-2 z-50 flex items-center gap-2 rounded-full border bg-popover/95 py-1 ps-3 pe-1 text-sm text-popover-foreground shadow-lg backdrop-blur"
      style={{ bottom: 'calc(var(--bottom-nav-height) + 0.5rem)' }}
    >
      <label htmlFor={id} className="font-medium">
        Theme
      </label>
      <select
        id={id}
        value={theme}
        onChange={(e) => {
          if (isThemeId(e.target.value)) change(e.target.value);
        }}
        className="min-h-tap rounded-full border border-input bg-background px-3 text-sm"
      >
        {THEMES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
